/**
 * 简单休眠函数
 * @param {number} timeMill 毫秒数
 */
function sleep(timeMill) {
  return new Promise(resolve => setTimeout(resolve, timeMill))
}

module.exports = {
  sleep
}
