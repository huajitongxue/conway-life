use tauri_plugin_dialog::DialogExt;

/// 导出预设：先弹原生“另存为”对话框，用户确认后再写文件。
///
/// Tauri 的 WebView 会把页面里的 `<a download>` 静默丢进系统下载目录，
/// 既不弹对话框也没有任何下载提示，用户根本找不到导出结果，所以桌面版改走这条路径。
/// 返回 `None` 表示用户取消了对话框。
#[tauri::command]
async fn export_presets_file(
  app: tauri::AppHandle,
  file_name: String,
  contents: String,
) -> Result<Option<String>, String> {
  // blocking_* 不能跑在主线程上；tauri 的异步命令执行在运行时线程里，这里是安全的。
  let picked = app
    .dialog()
    .file()
    .set_title("导出形状")
    .set_file_name(file_name)
    .add_filter("JSON 文件", &["json"])
    .blocking_save_file();

  let Some(picked) = picked else {
    return Ok(None);
  };

  let path = picked.into_path().map_err(|error| error.to_string())?;
  std::fs::write(&path, contents).map_err(|error| format!("写入文件失败：{error}"))?;
  Ok(Some(path.to_string_lossy().into_owned()))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .invoke_handler(tauri::generate_handler![export_presets_file])
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}
