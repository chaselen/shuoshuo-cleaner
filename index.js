const puppeteer = require("puppeteer-core");
const findChrome = require("chrome-finder");
const axios = require("axios").default;
const urlib = require("url");
const FormData = require("form-data");

console.log("程序已启动，查找Chrome浏览器");
const chromePath = findChrome();
// const chromePath =
// "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

async function main() {
  console.info(`启动浏览器：${chromePath}`);
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: false,
    defaultViewport: null,
  });
  console.log(`浏览器已启动，请勿关闭`);
  const pages = await browser.pages();
  const page = pages[0] || (await browser.newPage());
  await page.goto("https://qzone.qq.com", { waitUntil: "networkidle2" });
  console.log(`检测登录状态`);
  await page.waitForNavigation({
    timeout: 0,
  });

  // https://user.qzone.qq.com/{qq}
  const reg = /https:\/\/user.qzone.qq.com\/\d+/g;
  if (!reg.test(page.url())) {
    throw new Error(`登录失败`);
  }
  const qq = page.url().split("/").pop();
  console.log(`登录成功，当前QQ号：${qq}`);

  // 打开我的主页-说说
  await page.evaluate(`document.querySelector('.icon-say').click()`);
  console.log(`点开说说`);

  // 找到获取说说的请求
  const ssRequest = await page.waitForRequest(
    (req) => req.url().indexOf("cgi-bin/emotion_cgi_msglist_v6") > 0
  );
  // https://user.qzone.qq.com/proxy/domain/taotao.qq.com/cgi-bin/emotion_cgi_msglist_v6?uin={qq}&ftype=0&sort=0&pos=0&num=20&replynum=100&g_tk=821989383&callback=_preloadCallback&code_version=1&format=jsonp&need_private_comment=1&qzonetoken=181f48fbe948878569ff1970b249b34ad4b4d622927bf8ab388a9c91639d2b0d429298c30a620557&g_tk=821989383
  const ssUrl = ssRequest.url();
  const cookies = await page.cookies();
  console.log(`已获取请求参数和cookie，关闭浏览器`);
  await browser.close();

  // 解析请求参数
  let { qzonetoken, g_tk } = urlib.parse(ssUrl, true).query;
  if (Array.isArray(g_tk)) {
    g_tk = g_tk[0];
  }
  const cookieStr = cookies.map((a) => `${a.name}=${a.value}`).join("; ");
  // const { referer, "user-agent": userAgent } = ssRequest.headers();

  let url = ssUrl.replace(/format=jsonp/, "format=json");
  url = url.replace(/pos=\d+/, `pos=0`);
  let i = 1;
  while (true) {
    url = url.replace(/num=\d+/, `num=20`);
    const res = await axios.get(url, {
      headers: {
        cookie: cookieStr,
      },
    });
    const { total, msglist } = res.data;
    if (!msglist || msglist.length <= 0) {
      console.log(`没有说说了`);
      break;
    }
    console.log(`还有${total}条说说`);
    for (ss of msglist) {
      const { tid, content } = ss;
      console.log(
        `正在删除第${i}条："${
          content.length > 15 ? content.slice(0, 15) + ".." : content
        }."`
      );
      try {
        await deleteSS(qq, tid, qzonetoken, g_tk, cookieStr);
        i++;
        console.log(`删除成功`);
      } catch (err) {
        console.log(`删除失败`);
      }
    }
  }

  console.log(`任务执行完毕，程序结束`);
  await sleep(3000);
}

/**
 * 删除说说
 * @param {number|string} qq QQ号
 * @param {string} tid 说说id
 * @param {string} qzonetoken QQ空间token
 * @param {string} g_tk g_tk参数
 * @param {string} cookieStr cookie字符串
 */
async function deleteSS(qq, tid, qzonetoken, g_tk, cookieStr) {
  const form = new FormData();
  form.append("hostuin", qq);
  form.append("tid", tid);
  form.append("t1_source", "1");
  form.append("code_version", "1");
  form.append("format", "fs");
  form.append("qzreferrer", `https://user.qzone.qq.com/${qq}`);
  const deleteUrl = `https://user.qzone.qq.com/proxy/domain/taotao.qzone.qq.com/cgi-bin/emotion_cgi_delete_v6?qzonetoken=${qzonetoken}&g_tk=${g_tk}`;
  const res = await axios.post(deleteUrl, form, {
    headers: {
      ...form.getHeaders(),
      cookie: cookieStr,
    },
  });
  if (res.status == 200 && res.data.indexOf(`"code":0`) > 0) {
    // console.log(`删除成功`);
  } else {
    throw new Error(`删除失败`);
  }
}

function sleep(timeMill) {
  return new Promise((resolve) => setTimeout(resolve, timeMill));
}

try {
  main();
} catch (err) {
  console.error(`发生错误：`, err);
}
