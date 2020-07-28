const axios = require('axios').default
const FormData = require('form-data')
const { sleep } = require('./common')
require('colors')

// 出错重试时间间隔（秒）
const WAIT_ERR = 3

/**
 * QQ空间中js对计算gtk函数的定义
 */
/*
function q(a) {
  a = QZFL.util.URI(a)
  var b
  a &&
    (a.host && 0 < a.host.indexOf('qzone.qq.com')
      ? (b = QZFL.cookie.get('p_skey'))
      : a.host && 0 < a.host.indexOf('qq.com') && (b = QZFL.cookie.get('skey')))
  b || (b = QZFL.cookie.get('skey') || QZFL.cookie.get('rv2'))
  a = 5381
  for (var c = 0, d = b.length; c < d; ++c) a += (a << 5) + b.charAt(c).charCodeAt()
  return a & 2147483647
}
*/

/**
 * 根据cookie计算g_tk参数
 * @param {string} cookieStr cookie字符串
 */
function _getGTK(cookieStr) {
  const cookieMap = {}
  cookieStr.split('; ').forEach(c => {
    const kv = c.split('=')
    cookieMap[kv[0]] = kv[1]
  })
  let b = cookieMap['p_skey'] || cookieMap['skey'] || cookieMap['rv2']
  let a = 5381
  for (let c = 0, d = b.length; c < d; ++c) {
    a += (a << 5) + b.charAt(c).charCodeAt()
  }
  return a & 2147483647
}

/**
 * 分页获取说说列表
 * @param {string} ssUrl 原始获取说说的请求地址
 * @param {string} cookieStr cookie字符串
 * @param {number|string} page 第几页
 * @param {number|string} size 获取多少条，最多40
 */
async function getList(ssUrl, cookieStr, page = 1, size = 40) {
  size = Math.min(size, 40)
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
 * 删除一条说说
 * @param {number|string} qq QQ号
 * @param {string} tid 说说id
 * @param {string} qzonetoken QQ空间token
 * @param {string} g_tk g_tk参数
 * @param {string} cookieStr cookie字符串
 */
async function deleteOne(qq, tid, qzonetoken, g_tk, cookieStr) {
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

/**
 * 根据顺序清理说说（从新到旧）
 * @param {number|string} qq QQ号
 * @param {string} ssUrl 原始获取说说的请求地址
 * @param {string} qzonetoken QQ空间token
 * @param {string} g_tk g_tk参数
 * @param {string} cookieStr cookie字符串
 * @param {number} deleteSpan 删除间隔
 */
async function cleanByOrder(qq, ssUrl, qzonetoken, g_tk, cookieStr, deleteSpan = 0) {
  // 开始任务
  while (true) {
    try {
      // 获取说说
      const { code, message, total, msglist } = await getList(ssUrl, cookieStr, 1)
      if (code != 0) {
        console.log(`获取说说失败：${message}，重新获取`.red)
        await sleep(WAIT_ERR * 1000)
        continue
      }
      if (!msglist || msglist.length <= 0) {
        console.log(`没有说说了`)
        break
      }
      console.log(`还有${(total + '').bold}条说说`)

      // 删除说说
      let i = 1
      let breakOuterLoop = false // 是否要跳出外层循环
      while (msglist.length > 0) {
        const { tid, content } = msglist[0]
        console.log(`正在删除第${i}条："${content.length > 15 ? content.slice(0, 15) + '...' : content}"`)
        const { code, message } = await deleteOne(qq, tid, qzonetoken, g_tk, cookieStr)
        if (code == 0) {
          console.log(`删除成功${deleteSpan > 0 ? `，等待${deleteSpan}秒` : ''}`.green)
          msglist.shift()
          i++
          if (deleteSpan > 0 && msglist.length > 0) {
            await sleep(deleteSpan * 1000)
          }
        } else {
          if (code == -3001) {
            console.log('删除失败：需要验证码'.red)
            console.log('出现验证码，可能是由于操作频繁。程序终止，请改天再试！'.red)
            breakOuterLoop = true
            break
          } else {
            console.log(`删除失败：${message}`)
            await sleep(WAIT_ERR * 1000)
          }
        }
      }
      if (breakOuterLoop) {
        break
      }
    } catch (err) {
      console.error(err)
      await sleep(WAIT_ERR * 1000)
    }
  }
}

/**
 * 根据日期清理说说（时间段内）
 * @param {number|string} qq QQ号
 * @param {string} ssUrl 原始获取说说的请求地址
 * @param {string} qzonetoken QQ空间token
 * @param {string} g_tk g_tk参数
 * @param {string} cookieStr cookie字符串
 * @param {Date} startDate 开始日期
 * @param {Date} endDate 结束日期
 * @param {number} deleteSpan 删除间隔
 */
async function cleanByDate(qq, ssUrl, qzonetoken, g_tk, cookieStr, startDate, endDate, deleteSpan = 0) {
  // 保证startDate时间在endDate之前
  if (startDate.valueOf() > endDate.valueOf()) {
    const temp = startDate
    startDate = endDate
    endDate = temp
  }
  startDate.setHours(0, 0, 0)
  endDate.setHours(23, 59, 59)
  const startTimestamp = startDate.valueOf() / 1000,
    endTimestamp = endDate.valueOf() / 1000

  const { totalPage, msglist: allMsgList } = await getList(ssUrl, cookieStr, 1)
  console.log(`共有${totalPage}页数据`)
  for (let p = 2; p <= totalPage; p++) {
    console.log(`正在获取第${p}页数据`)
    const { msglist } = await getList(ssUrl, cookieStr, p)
    allMsgList.push(...msglist)
    console.log(`已获取${allMsgList.length}条`)
  }

  // 时间段内的说说
  const msglist = allMsgList.filter(m => m.created_time >= startTimestamp && m.created_time <= endTimestamp)
  console.log(`所有数据获取完毕，时间段内的说说有${(msglist.length + '').bold}条`)

  // 删除说说
  let i = 1
  while (msglist.length > 0) {
    const { tid, content } = msglist[0]
    console.log(`正在删除第${i}条："${content.length > 15 ? content.slice(0, 15) + '...' : content}"`)
    const { code, message } = await deleteOne(qq, tid, qzonetoken, g_tk, cookieStr)
    if (code == 0) {
      console.log(`删除成功${deleteSpan > 0 ? `，等待${deleteSpan}秒` : ''}`.green)
      msglist.shift()
      i++
      if (deleteSpan > 0 && msglist.length > 0) {
        await sleep(deleteSpan * 1000)
      }
    } else {
      if (code == -3001) {
        console.log('删除失败：需要验证码'.red)
        console.log('出现验证码，可能是由于操作频繁。程序终止，请改天再试！'.red)
        break
      } else {
        console.log(`删除失败：${message}`)
        await sleep(WAIT_ERR * 1000)
      }
    }
  }
}

module.exports = {
  getList,
  deleteOne,
  cleanByOrder,
  cleanByDate
}
