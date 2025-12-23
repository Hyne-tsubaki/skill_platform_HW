// utils/responseHelper.js
class ResponseHelper {
  static success(res, message = '操作成功', data = null) {
    res.json({
      code: 0,
      message,
      data
    });
  }

  static error(res, message = '操作失败', code = 1) {
    res.status(400).json({
      code,
      message,
      data: null
    });
  }

  static unauthorized(res, message = '未登录或Token无效') {
    res.status(401).json({
      code: 401,
      message,
      data: null
    });
  }

  static forbidden(res, message = '权限不足') {
    res.status(403).json({
      code: 403,
      message,
      data: null
    });
  }
}

function sendResponse(res, code, message, data = null) {
  res.status(code).json({
    success: code >= 200 && code < 300, // code 2xx 为成功
    code,
    message,
    data
  });
}

// 修正：合并所有需要暴露的成员，避免覆盖
module.exports = {
  ResponseHelper, // 暴露类
  sendResponse    // 暴露独立方法
};