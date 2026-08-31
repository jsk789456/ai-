(function () {
  const DomCore = typeof window !== 'undefined' ? window.DomCore : require('../dom-core.js');
  const registerAdapter = DomCore.registerAdapter;

  registerAdapter({
    name: 'universal-demo',
    match: (url) => /test-page\.html|localhost|127\.0\.0\.1/.test(url),
    matchPriority: 0,
    selectors: {
      qBlock: '.question',
      stem: '.q-stem',
      option: '.q-option',
      optText: '.q-opt-text',
      blankInput: '.q-blank input, .q-blank textarea',
    },
  });

  registerAdapter({
    name: 'chaoxing',
    match: (url) => /mooc\.icourse163\.org|chaoxing\.com/i.test(url),
    selectors: {
      qBlock: '.questionLi, .topic-item',
      stem: '.questionTitle, .title',
      option: '.optionItem, .answerBg',
      optText: '.optionText, .answerText',
      blankInput: 'input[type=text], textarea',
    },
  });

  registerAdapter({
    name: 'zhihui-zhongxiaoxue',
    match: (url) => /basic\.smartedu\.cn|smartedu\.cn/i.test(url),
    selectors: {
      qBlock: '.question-container, .q-item',
      stem: '.question-title, .q-stem',
      option: '.option-item, .q-option',
      optText: '.option-content, .q-opt-text',
      blankInput: 'input[type=text], textarea',
    },
  });
})();
