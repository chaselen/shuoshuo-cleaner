const axios = require('axios').default
const FormData = require('form-data')

/**
 * 分页获取说说列表
 * @param {string} ssUrl 原始获取说说的请求地址
 * @param {string} cookieStr cookie字符串
 * @param {number|string} page 第几页
 * @param {number|string} size 获取多少条
 */
async function getList(ssUrl, cookieStr, page = 1, size = 20) {
  let url = ssUrl.replace(/format=jsonp/, 'format=json')
  url = url.replace(/pos=\d+/, `pos=${(page - 1) * (size - 0)}`)
  url = url.replace(/num=\d+/, `num=${size}`)
  const res = await axios.get(url, {
    headers: {
      cookie: cookieStr
    }
  })
  /**
   * 获取说说的结果为json
   * 1. 成功时，code: 0, message: '', total: 说说总条数，msglist：说说列表
   * 2. 未登录时，code: -3000, message:'请先登录空间', subcode:-4001
   */
  const { code, message, total, msglist } = res.data
  const totalPage = Math.floor((total + size - 1) / size)
  return {
    code,
    message,
    total,
    msglist: msglist || [],
    totalPage,
    hasNextPage: totalPage > page
  }
}

/**
 * 删除说说
 * @param {number|string} qq QQ号
 * @param {string} tid 说说id
 * @param {string} qzonetoken QQ空间token
 * @param {string} g_tk g_tk参数
 * @param {string} cookieStr cookie字符串
 */
async function remove(qq, tid, qzonetoken, g_tk, cookieStr) {
  const form = new FormData()
  form.append('hostuin', qq)
  form.append('tid', tid)
  form.append('t1_source', '1')
  form.append('code_version', '1')
  form.append('format', 'fs')
  form.append('qzreferrer', `https://user.qzone.qq.com/${qq}`)
  const deleteUrl = `https://user.qzone.qq.com/proxy/domain/taotao.qzone.qq.com/cgi-bin/emotion_cgi_delete_v6?qzonetoken=${qzonetoken}&g_tk=${g_tk}`
  const res = await axios.post(deleteUrl, form, {
    headers: {
      ...form.getHeaders(),
      cookie: cookieStr
    }
  })

  /*
  删除说说的返回值为html字符串
  例：'<html><head><meta http-equiv="Content-Type" content="text/html; charset=UTF-8" /></head><body><script type="text/javascript"> var cb;try{document.domain="qzone.qq.com";cb=frameElement.callback;}catch(e){try{document.domain="qzone.com";cb=frameElement.callback;}catch(e){document.domain="qq.com";cb=frameElement.callback;}} frameElement.callback({"code":0,"err":{"code":0},"message":"","smoothpolicy":{"comsw.disable_soso_search":0,"l1sw.read_first_cache_only":0,"l2sw.dont_get_reply_cmt":0,"l2sw.mixsvr_frdnum_per_time":50,"l3sw.hide_reply_cmt":0,"l4sw.read_tdb_only":0,"l5sw.read_cache_only":0},"subcode":0}); </script></body></html>'
  1. 正常返回 {"code":0,"message":"","subcode":0}
  2. 需要验证码 {"code":-3001,"message":"","needVerify":4,"subcode":1024}
  */
  // 使用正则获取json
  const reg = /frameElement\.callback\((.+)\)/
  const isMatch = reg.test(res.data)
  if (!isMatch) {
    throw new Error('解析返回数据失败')
  }

  res.data = JSON.parse(RegExp.$1)
  return res.data
}

module.exports = {
  getList,
  remove
}
