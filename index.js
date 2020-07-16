const puppeteer = require('puppeteer-core')
const findChrome = require('chrome-finder')
const urlib = require('url')
const shuoshuo = require('./shuoshuo')
require('colors')

// 开始执行任务前等待时间（秒）
const WAIT_SEC = 10
// 出错重试时间间隔（秒）
const WAIT_ERR = 3

async function main() {
  console.log('程序已启动，正在查找Chrome浏览器'.blue)
  const chromePath = findChrome()
  // const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  console.log(`启动浏览器：${chromePath.bold}`)
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: false,
    defaultViewport: null
  })
  console.log('浏览器已启动，请勿关闭')
  const pages = await browser.pages()
  const page = pages[0] || (await browser.newPage())
  await page.goto('https://qzone.qq.com', { waitUntil: 'networkidle2' })
  console.log('检测登录状态')
  await page.waitForNavigation({
    timeout: 0
  })

  // https://user.qzone.qq.com/{qq}
  const reg = /https:\/\/user.qzone.qq.com\/\d+/g
  if (!reg.test(page.url())) {
    throw new Error('登录失败')
  }
  const qq = page.url().split('/').pop()
  console.log(`登录成功，当前QQ号：${qq}`.green)

  // 打开我的主页-说说
  await page.evaluate(`document.querySelector('.icon-say').click()`)
  console.log('正在打开说说页面')

  // 找到获取说说的请求
  // https://user.qzone.qq.com/proxy/domain/taotao.qq.com/cgi-bin/emotion_cgi_msglist_v6?uin={qq}&ftype=0&sort=0&pos=0&num=20&replynum=100&g_tk=821989383&callback=_preloadCallback&code_version=1&format=jsonp&need_private_comment=1&qzonetoken=181f48fbe948878569ff1970b249b34ad4b4d622927bf8ab388a9c91639d2b0d429298c30a620557&g_tk=821989383
  const ssRequest = await page.waitForRequest(req => req.url().indexOf('cgi-bin/emotion_cgi_msglist_v6') > 0)
  const ssUrl = ssRequest.url()
  const cookies = await page.cookies()
  console.log(`已获取请求参数和cookie，关闭浏览器`)
  await browser.close()

  // 解析请求参数
  let { qzonetoken, g_tk } = urlib.parse(ssUrl, true).query
  if (Array.isArray(g_tk)) {
    g_tk = g_tk[0]
  }
  const cookieStr = cookies.map(a => `${a.name}=${a.value}`).join('; ')
  // const { referer, "user-agent": userAgent } = ssRequest.headers();

  // 运行任务前等待
  console.log(`程序将在${WAIT_SEC}秒后开始删除说说，如需终止请手动关闭程序`.yellow.bold)
  await sleep(WAIT_SEC * 1000)

  // 开始任务
  let i = 1
  while (true) {
    try {
      // 获取说说
      const { code, message, total, msglist } = await shuoshuo.getList(ssUrl, cookieStr, 1)
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
      let breakOuterLoop = false // 是否要跳出外层循环
      while (msglist.length > 0) {
        const { tid, content } = msglist[0]
        console.log(`正在删除第${i}条："${content.length > 15 ? content.slice(0, 15) + '...' : content}."`)
        const { code, message } = await shuoshuo.remove(qq, tid, qzonetoken, g_tk, cookieStr)
        if (code == 0) {
          console.log(`删除成功`.green)
          msglist.shift()
          i++
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

  console.log(`任务执行完毕，程序结束`.blue)
  await sleep(1e8)
}

/**
 * 简单休眠函数
 * @param {number} timeMill 毫秒数
 */
function sleep(timeMill) {
  return new Promise(resolve => setTimeout(resolve, timeMill))
}

main()
  .then()
  .catch(err => {
    console.error(`发生错误：${err.message}`.red)
  })
