// 平台识别注册表：把用户列出的主流学习与考试平台登记为"已适配"平台。
// 说明：
//  - 这里只做"域名识别 + 平台命名"，提取题仍统一走 dom-core 的通用扫描（heuristicScan），
//    因为各平台真实 DOM 结构未逐一验证，盲目写死选择器反而容易误判/漏题。
//  - 通用扫描已能覆盖绝大多数"标准表单（radio/checkbox/input）"型答题页，
//    所以这些平台装上脚本即可用；少数"纯 div 点击型"需单独拿真实 HTML 精调。
//  - 若某平台匹配不到域名，回退到 universal 适配器，行为不变。
(function () {
  const DomCore = typeof window !== 'undefined'
    ? window.DomCore
    : (typeof require !== 'undefined' ? require('../dom-core.js') : null);
  if (!DomCore || !DomCore.registerAdapter) return;
  const registerAdapter = DomCore.registerAdapter;

  // [平台名, 域名匹配正则]（域名为最佳猜测；仅用于识别，不影响提取）
  const PLATFORMS = [
    ['超星学习通', /chaoxing\.com/i],
    ['智慧树 / 知到', /zhihuishu\.com/i],
    ['智慧职教 / 职教云', /icve\.com\.cn|zjy\.icve|zj\.icve/i],
    ['雨课堂', /yuketang\.(cn|com)/i],
    ['考试星', /kaoshixing\.com/i],
    ['168网校', /168wangxiao|168wx|168\.wangxiao/i],
    ['绎通云课堂', /ytyun|ytkt|yitongyun|ytwangxiao/i],
    ['九江系列', /jjxy|jiujiang/i],
    ['柠檬文才', /wenicai|ningmeng|lemonwen|nmwen/i],
    ['亿学宝云', /yixuebao|yxbcloud|yxb\.|e3cloud/i],
    ['优课学堂', /youkexuetang|youkewangxiao|ukewen/i],
    ['小鹅通', /xiaoe(-tech)?\.com|xiaoe\.cn/i],
    ['安徽继续教育', /ahjxjy|ahsjxjy|ahjx\.cn/i],
    ['上海开放大学', /sou\.edu\.cn/i],
    ['华侨大学自考网络助学', /hqu\.edu\.cn/i],
    ['良师在线', /liangshionline|liangshi/i],
    ['和学在线', /hexueonline|hexuewangxiao|hexue/i],
    ['人卫慕课', /pmphmooc/i],
    ['国家开放大学', /ouchn\.edu\.cn|crtvu\.edu\.cn|ouc\.edu\.cn/i],
    ['山财培训网（继续教育）', /sdufe\.edu\.cn|sctu|scai\.edu\.cn/i],
    ['浙江高校在线开放课程', /zjooc\.cn|zjooc/i],
    ['中国地质大学远程继续教育', /cug\.edu\.cn|cugb\.edu\.cn/i],
    ['重庆大学网络教育学院', /cqu\.edu\.cn/i],
    ['浙江自考网络助学', /zjzk|zjzikao/i],
    ['湖南高等学历继续教育', /hunanjxjy|hnjxjy|hnedu\.cn/i],
    ['优学院', /uxueyuan/i],
    ['学起系列', /xueqipay|xueqi\.|xueqiwang/i],
    ['青书学堂', /qingshuxuetang|qingshuedu|qingshu/i],
    ['学堂在线', /xuetangx\.com/i],
    ['英华学堂', /yinghuaxuetang|yinghua/i],
    ['广开网络教学平台', /gzkmu\.edu\.cn|gou\.edu\.cn|guangkai/i],
    ['中国大学MOOC', /icourse163\.org|icourse\.163/i],
  ];

  PLATFORMS.forEach(([name, re]) => {
    registerAdapter({
      name: name + '（已适配）',
      match: (url) => re.test(url || ''),
      matchPriority: 10,
    });
  });
})();
