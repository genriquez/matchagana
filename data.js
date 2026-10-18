// Game content. Romaji uses Hepburn with long vowels spelled out (e.g. "kyou"),
// which maps one-to-one onto the kana and is easiest for beginners.

grab().run((ctx) => {
  const KANA_GROUPS = [
    { id: "a", label: "あ a i u e o" },
    { id: "ka", label: "か ka" },
    { id: "sa", label: "さ sa" },
    { id: "ta", label: "た ta" },
    { id: "na", label: "な na" },
    { id: "ha", label: "は ha" },
    { id: "ma", label: "ま ma" },
    { id: "ya", label: "や ya" },
    { id: "ra", label: "ら ra" },
    { id: "wa", label: "わ wa · ん n" },
    { id: "ga", label: "が ga" },
    { id: "za", label: "ざ za" },
    { id: "da", label: "だ da" },
    { id: "ba", label: "ば ba" },
    { id: "pa", label: "ぱ pa" },
    { id: "yoon", label: "きゃ combos" },
  ];

  // [hiragana, katakana, romaji]
  const KANA_ROWS = {
    a: [["あ", "ア", "a"], ["い", "イ", "i"], ["う", "ウ", "u"], ["え", "エ", "e"], ["お", "オ", "o"]],
    ka: [["か", "カ", "ka"], ["き", "キ", "ki"], ["く", "ク", "ku"], ["け", "ケ", "ke"], ["こ", "コ", "ko"]],
    sa: [["さ", "サ", "sa"], ["し", "シ", "shi"], ["す", "ス", "su"], ["せ", "セ", "se"], ["そ", "ソ", "so"]],
    ta: [["た", "タ", "ta"], ["ち", "チ", "chi"], ["つ", "ツ", "tsu"], ["て", "テ", "te"], ["と", "ト", "to"]],
    na: [["な", "ナ", "na"], ["に", "ニ", "ni"], ["ぬ", "ヌ", "nu"], ["ね", "ネ", "ne"], ["の", "ノ", "no"]],
    ha: [["は", "ハ", "ha"], ["ひ", "ヒ", "hi"], ["ふ", "フ", "fu"], ["へ", "ヘ", "he"], ["ほ", "ホ", "ho"]],
    ma: [["ま", "マ", "ma"], ["み", "ミ", "mi"], ["む", "ム", "mu"], ["め", "メ", "me"], ["も", "モ", "mo"]],
    ya: [["や", "ヤ", "ya"], ["ゆ", "ユ", "yu"], ["よ", "ヨ", "yo"]],
    ra: [["ら", "ラ", "ra"], ["り", "リ", "ri"], ["る", "ル", "ru"], ["れ", "レ", "re"], ["ろ", "ロ", "ro"]],
    wa: [["わ", "ワ", "wa"], ["を", "ヲ", "wo"], ["ん", "ン", "n"]],
    ga: [["が", "ガ", "ga"], ["ぎ", "ギ", "gi"], ["ぐ", "グ", "gu"], ["げ", "ゲ", "ge"], ["ご", "ゴ", "go"]],
    za: [["ざ", "ザ", "za"], ["じ", "ジ", "ji"], ["ず", "ズ", "zu"], ["ぜ", "ゼ", "ze"], ["ぞ", "ゾ", "zo"]],
    // ぢ/づ share romaji with じ/ず; the deck builder never deals both in one game.
    da: [["だ", "ダ", "da"], ["ぢ", "ヂ", "ji"], ["づ", "ヅ", "zu"], ["で", "デ", "de"], ["ど", "ド", "do"]],
    ba: [["ば", "バ", "ba"], ["び", "ビ", "bi"], ["ぶ", "ブ", "bu"], ["べ", "ベ", "be"], ["ぼ", "ボ", "bo"]],
    pa: [["ぱ", "パ", "pa"], ["ぴ", "ピ", "pi"], ["ぷ", "プ", "pu"], ["ぺ", "ペ", "pe"], ["ぽ", "ポ", "po"]],
  };

  // Yōon: i-column kana + small ya/yu/yo. [hiragana base, katakana base, romaji stem]
  const YOON_BASES = [
    ["き", "キ", "ky"], ["し", "シ", "sh"], ["ち", "チ", "ch"], ["に", "ニ", "ny"],
    ["ひ", "ヒ", "hy"], ["み", "ミ", "my"], ["り", "リ", "ry"], ["ぎ", "ギ", "gy"],
    ["じ", "ジ", "j"], ["び", "ビ", "by"], ["ぴ", "ピ", "py"],
  ];

  const KANA = [];
  for (const [group, rows] of Object.entries(KANA_ROWS)) {
    for (const [hira, kata, romaji] of rows) KANA.push({ hira, kata, romaji, group });
  }
  for (const [h, k, stem] of YOON_BASES) {
    [["ゃ", "ャ", "a"], ["ゅ", "ュ", "u"], ["ょ", "ョ", "o"]].forEach(([sh, sk, v]) => {
      KANA.push({ hira: h + sh, kata: k + sk, romaji: stem + v, group: "yoon" });
    });
  }

  const WORD_THEMES = [
    { id: "animals", label: "Animals" },
    { id: "food", label: "Food & drink" },
    { id: "family", label: "Family" },
    { id: "people", label: "People" },
    { id: "numbers", label: "Numbers" },
    { id: "colors", label: "Colors" },
    { id: "body", label: "Body" },
    { id: "nature", label: "Nature" },
    { id: "time", label: "Time" },
    { id: "places", label: "Places & things" },
    { id: "verbs", label: "Verbs" },
    { id: "adjectives", label: "Adjectives" },
  ];

  // [kana, romaji, english, kanji (or null), theme]
  const WORDS = [
    ["ねこ", "neko", "cat", "猫", "animals"],
    ["いぬ", "inu", "dog", "犬", "animals"],
    ["とり", "tori", "bird", "鳥", "animals"],
    ["さかな", "sakana", "fish", "魚", "animals"],
    ["うま", "uma", "horse", "馬", "animals"],
    ["うし", "ushi", "cow", "牛", "animals"],
    ["くま", "kuma", "bear", "熊", "animals"],
    ["さる", "saru", "monkey", "猿", "animals"],
    ["うさぎ", "usagi", "rabbit", null, "animals"],
    ["むし", "mushi", "insect", "虫", "animals"],
    ["かめ", "kame", "turtle", "亀", "animals"],
    ["ねずみ", "nezumi", "mouse", null, "animals"],

    ["みず", "mizu", "water", "水", "food"],
    ["ごはん", "gohan", "rice / meal", "ご飯", "food"],
    ["おちゃ", "ocha", "tea", "お茶", "food"],
    ["にく", "niku", "meat", "肉", "food"],
    ["たまご", "tamago", "egg", "卵", "food"],
    ["やさい", "yasai", "vegetables", "野菜", "food"],
    ["くだもの", "kudamono", "fruit", "果物", "food"],
    ["りんご", "ringo", "apple", null, "food"],
    ["すし", "sushi", "sushi", "寿司", "food"],
    ["しお", "shio", "salt", "塩", "food"],
    ["さとう", "satou", "sugar", "砂糖", "food"],

    ["はは", "haha", "mother", "母", "family"],
    ["ちち", "chichi", "father", "父", "family"],
    ["あに", "ani", "older brother", "兄", "family"],
    ["あね", "ane", "older sister", "姉", "family"],
    ["おとうと", "otouto", "younger brother", "弟", "family"],
    ["いもうと", "imouto", "younger sister", "妹", "family"],
    ["こども", "kodomo", "child", "子供", "family"],
    ["かぞく", "kazoku", "family", "家族", "family"],

    ["ひと", "hito", "person", "人", "people"],
    ["ともだち", "tomodachi", "friend", "友達", "people"],
    ["せんせい", "sensei", "teacher", "先生", "people"],
    ["がくせい", "gakusei", "student", "学生", "people"],
    ["おとこ", "otoko", "man", "男", "people"],
    ["おんな", "onna", "woman", "女", "people"],

    ["いち", "ichi", "one", "一", "numbers"],
    ["に", "ni", "two", "二", "numbers"],
    ["さん", "san", "three", "三", "numbers"],
    ["よん", "yon", "four", "四", "numbers"],
    ["ご", "go", "five", "五", "numbers"],
    ["ろく", "roku", "six", "六", "numbers"],
    ["なな", "nana", "seven", "七", "numbers"],
    ["はち", "hachi", "eight", "八", "numbers"],
    ["きゅう", "kyuu", "nine", "九", "numbers"],
    ["じゅう", "juu", "ten", "十", "numbers"],

    ["あか", "aka", "red", "赤", "colors"],
    ["あお", "ao", "blue", "青", "colors"],
    ["しろ", "shiro", "white", "白", "colors"],
    ["くろ", "kuro", "black", "黒", "colors"],
    ["きいろ", "kiiro", "yellow", "黄色", "colors"],
    ["みどり", "midori", "green", "緑", "colors"],

    ["め", "me", "eye", "目", "body"],
    ["みみ", "mimi", "ear", "耳", "body"],
    ["くち", "kuchi", "mouth", "口", "body"],
    ["て", "te", "hand", "手", "body"],
    ["あし", "ashi", "foot / leg", "足", "body"],
    ["あたま", "atama", "head", "頭", "body"],
    ["かお", "kao", "face", "顔", "body"],
    ["はな", "hana", "nose", "鼻", "body"],

    ["やま", "yama", "mountain", "山", "nature"],
    ["かわ", "kawa", "river", "川", "nature"],
    ["うみ", "umi", "sea", "海", "nature"],
    ["そら", "sora", "sky", "空", "nature"],
    ["あめ", "ame", "rain", "雨", "nature"],
    ["ゆき", "yuki", "snow", "雪", "nature"],
    ["き", "ki", "tree", "木", "nature"],
    ["はな", "hana", "flower", "花", "nature"],
    ["ひ", "hi", "fire", "火", "nature"],
    ["つき", "tsuki", "moon", "月", "nature"],
    ["ほし", "hoshi", "star", "星", "nature"],
    ["かぜ", "kaze", "wind", "風", "nature"],

    ["あさ", "asa", "morning", "朝", "time"],
    ["ひる", "hiru", "noon", "昼", "time"],
    ["よる", "yoru", "night", "夜", "time"],
    ["きょう", "kyou", "today", "今日", "time"],
    ["あした", "ashita", "tomorrow", "明日", "time"],
    ["きのう", "kinou", "yesterday", "昨日", "time"],
    ["いま", "ima", "now", "今", "time"],

    ["いえ", "ie", "house", "家", "places"],
    ["みせ", "mise", "shop", "店", "places"],
    ["がっこう", "gakkou", "school", "学校", "places"],
    ["えき", "eki", "station", "駅", "places"],
    ["くるま", "kuruma", "car", "車", "places"],
    ["でんしゃ", "densha", "train", "電車", "places"],
    ["ほん", "hon", "book", "本", "places"],
    ["かさ", "kasa", "umbrella", "傘", "places"],
    ["でんわ", "denwa", "telephone", "電話", "places"],

    ["たべる", "taberu", "to eat", "食べる", "verbs"],
    ["のむ", "nomu", "to drink", "飲む", "verbs"],
    ["みる", "miru", "to see", "見る", "verbs"],
    ["いく", "iku", "to go", "行く", "verbs"],
    ["くる", "kuru", "to come", "来る", "verbs"],
    ["ねる", "neru", "to sleep", "寝る", "verbs"],
    ["かく", "kaku", "to write", "書く", "verbs"],
    ["よむ", "yomu", "to read", "読む", "verbs"],
    ["はなす", "hanasu", "to speak", "話す", "verbs"],
    ["きく", "kiku", "to listen", "聞く", "verbs"],

    ["おおきい", "ookii", "big", "大きい", "adjectives"],
    ["ちいさい", "chiisai", "small", "小さい", "adjectives"],
    ["あつい", "atsui", "hot", "暑い", "adjectives"],
    ["さむい", "samui", "cold", "寒い", "adjectives"],
    ["たかい", "takai", "expensive / tall", "高い", "adjectives"],
    ["やすい", "yasui", "cheap", "安い", "adjectives"],
    ["あたらしい", "atarashii", "new", "新しい", "adjectives"],
    ["ふるい", "furui", "old (things)", "古い", "adjectives"],
  ].map(([kana, romaji, english, kanji, theme]) => ({ kana, romaji, english, kanji, theme }));

  // Groups of characters that are easy to confuse visually. Used to make wrong
  // options harder at higher difficulty. A character may appear in several groups.
  const KANA_LOOKALIKES = [
    // katakana
    "シツ", "ソン", "ソリ", "ンリ", "ノメ", "クケタ", "ウワフ", "コユロ", "チテ", "ナメ",
    "ヌス", "マム", "ルレ", "エユ", "セヤ", "カヤ", "ヲヨ", "ラヲ", "サセ", "ホオ",
    // hiragana
    "ぬめ", "ねれわ", "さちき", "はほま", "るろ", "あおめ", "いこり", "うらつ", "けは",
    "にこ", "しも", "くへ", "たな", "ゆよ", "ぬね", "めの", "すお", "そろ",
  ];

  // Lookalike kanji (only pairs where at least one appears in WORDS matter).
  const KANJI_LOOKALIKES = [
    "大犬太", "木本", "人入", "白日目", "鳥馬魚熊", "雨雪電", "手毛", "男田", "女安妹姉",
    "話読語", "飲食", "見目", "茶菜花", "青新", "母毎", "子学", "赤黄", "山出", "川三",
    "牛午", "今会", "夜家", "店広", "書昼", "耳取", "足走", "空穴", "星生", "古口",
  ];

  ctx.data = { KANA_GROUPS, KANA, WORD_THEMES, WORDS, KANA_LOOKALIKES, KANJI_LOOKALIKES };
});
