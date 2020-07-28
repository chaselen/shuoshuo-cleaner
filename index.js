const puppeteer = require('puppeteer-core')
const findChrome = require('chrome-finder')
const urlib = require('url')
const shuoshuo = require('./shuoshuo')
const { sleep } = require('./common')
require('colors')
const prompts = require('prompts')

// 配置项：删除间隔（默认是3）
let setting_deleteSpan = 3

// 开始执行任务前等待时间（秒）
const WAIT_SEC = 10

async function main() {
  console.log('程序已启动，正在查找Chrome浏览器'.cyan)
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

  // 选择清理方式。取消时值为-1
  const { selectIndex } = await prompts({
    type: 'select',
    name: 'selectIndex',
    message: '选择一个清理方式：'.cyan.bold,
    choices: [{ title: '从新到旧清理' }, { title: '按时间范围清理（需要获取所有说说数据，比较慢）' }],
    initial: 0,
    hint: '使用方向键选择，回车键确认'
  })
  if (selectIndex == 0) {
    // 从新到旧
    setting_deleteSpan = await getDeleteSpanSetting()
    await waitBeforeRun()
    await shuoshuo.cleanByOrder(qq, ssUrl, qzonetoken, g_tk, cookieStr, setting_deleteSpan)
  } else if (selectIndex == 1) {
    // 按时间范围
    const { startDate, endDate } = await getDeleteDateSetting()
    setting_deleteSpan = await getDeleteSpanSetting()
    await waitBeforeRun()
    await shuoshuo.cleanByDate(qq, ssUrl, qzonetoken, g_tk, cookieStr, startDate, endDate, setting_deleteSpan)
  }

  console.log(`任务执行完毕，程序结束`.cyan)
  await sleep(1e8)
  process.exit(0)
}

/**
 * 删除前等待
 */
async function waitBeforeRun() {
  console.log(`任务将在${WAIT_SEC}秒后开始执行，如需终止请手动关闭程序`.yellow.bold)
  await sleep(WAIT_SEC * 1000)
}

/**
 * 获取删除间隔设置
 */
async function getDeleteSpanSetting() {
  const { value } = await prompts({
    type: 'number',
    name: 'value',
    message: `${'设置删除间隔（秒）：'.cyan.bold}（默认是${setting_deleteSpan}）`,
    validate: value => (value && value >= 0 ? true : '请输入大于等于0的数字'.red)
  })
  console.log(`设置删除间隔为${value}秒`)
  return value
}

/**
 * 获取删除时间范围设置
 */
async function getDeleteDateSetting() {
  let startDate, endDate
  while (true) {
    let { input } = await prompts({
      type: 'text',
      name: 'input',
      message: `${'输入要删除说说的时间范围：'.cyan.bold}（例：2020-07-01~2020-07-15）`
    })
    input = input.trim()
    if (!input) {
      continue
    }
    if (!/\d{4}-\d{1,2}-\d{1,2}~\d{4}-\d{1,2}-\d{1,2}/.test(input)) {
      console.log('输入格式有误，请重新输入'.red)
      continue
    }
    startDate = new Date(input.split('~')[0])
    endDate = new Date(input.split('~')[1])
    if (isNaN(startDate.valueOf())) {
      console.log(`${startDate}不是一个有效日期`.red)
      continue
    }
    if (isNaN(endDate.valueOf())) {
      console.log(`${endDate}不是一个有效日期`.red)
      continue
    }
    break
  }
  return {
    startDate,
    endDate
  }
}

main()
  .then()
  .catch(err => {
    console.error(`发生错误：${err.message}`.red)
  })
