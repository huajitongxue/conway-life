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
    .invoke_handler(tauri::generate_handler![export_presets_file, export_replay_file])
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}

/// 二进制回放另存为；不把大文件转为 JSON 数字列表，不允许前端指定任意写入路径。
#[tauri::command]
async fn export_replay_file(
  app: tauri::AppHandle,
  request: tauri::ipc::Request<'_>,
) -> Result<Option<String>, String> {
  const MAX_BYTES: usize = 80 * 1024 * 1024;
  let bytes = match request.body() {
    tauri::ipc::InvokeBody::Raw(bytes) => {
      if bytes.len() > MAX_BYTES { return Err("回放文件超过 80 MiB".into()); }
      bytes.clone()
    }
    // IPC 协议被 WebView 阻止时，Tauri 的桥接会回退为字节数组。
    tauri::ipc::InvokeBody::Json(value) => {
      let values = value.as_array().ok_or("需要二进制回放数据")?;
      if values.len() > MAX_BYTES { return Err("回放文件超过 80 MiB".into()); }
      values.iter().map(|value| {
        value.as_u64().filter(|byte| *byte <= 255).map(|byte| byte as u8).ok_or("回放字节无效".to_string())
      }).collect::<Result<Vec<u8>, String>>()?
    }
  };
  if bytes.len() < 16 || &bytes[..8] != b"CWLREPL\0" { return Err("回放标识无效".into()); }
  let file_name = request.headers().get("x-conway-filename").and_then(|value| value.to_str().ok())
    .filter(|name| name.len() <= 128 && name.ends_with(".conway-replay")
      && name.bytes().all(|byte| byte.is_ascii_alphanumeric() || b"-_.".contains(&byte)))
    .unwrap_or("conway-life-replay.conway-replay").to_string();
  tauri::async_runtime::spawn_blocking(move || {
    let picked = app.dialog().file().set_title("导出回放")
      .set_file_name(file_name).add_filter("Conway 回放", &["conway-replay"]).blocking_save_file();
    let Some(picked) = picked else { return Ok(None); };
    let path = picked.into_path().map_err(|error| error.to_string())?;
    std::fs::write(&path, bytes).map_err(|error| format!("写入文件失败：{error}"))?;
    Ok(Some(path.to_string_lossy().into_owned()))
  }).await.map_err(|error| error.to_string())?
}
