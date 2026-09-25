import fs from 'node:fs'
import path from 'node:path'

const LOCALES_DIR = path.resolve('src/i18n/locales')
const locales = ['en', 'zh', 'zh-TW', 'fr', 'ja', 'ru', 'vi']

const keys = {
  en: {
    'Security verification': 'Security verification',
    'Complete the verification below to continue (slider, click, or image captcha may appear).':
      'Complete the verification below to continue (slider, click, or image captcha may appear).',
    'Failed to load captcha': 'Failed to load captcha',
    'Refresh captcha': 'Refresh captcha',
    'Slider verification': 'Slider verification',
    'Click verification': 'Click verification',
    'Image captcha': 'Image captcha',
    'Hold and drag the slider to the right': 'Hold and drag the slider to the right',
    'Drag the slider to complete verification': 'Drag the slider to complete verification',
    Verified: 'Verified',
    'Please click in order: {{sequence}}': 'Please click in order: {{sequence}}',
    'Clicks complete, ready to submit': 'Clicks complete, ready to submit',
    'Clicked {{current}}/{{total}}': 'Clicked {{current}}/{{total}}',
    'Enter the characters in the image': 'Enter the characters in the image',
    'Enter {{length}}-character code': 'Enter {{length}}-character code',
    'Confirm and continue': 'Confirm and continue',
  },
  zh: {
    'Security verification': '安全验证',
    'Complete the verification below to continue (slider, click, or image captcha may appear).':
      '请完成下方验证后继续（可能出现滑块、点选或图形验证码）。',
    'Failed to load captcha': '验证码加载失败',
    'Refresh captcha': '换一张',
    'Slider verification': '滑块验证',
    'Click verification': '点选验证',
    'Image captcha': '图形验证码',
    'Hold and drag the slider to the right': '按住滑块，拖动到最右侧',
    'Drag the slider to complete verification': '拖动滑块完成验证',
    Verified: '验证通过',
    'Please click in order: {{sequence}}': '请依次点击：{{sequence}}',
    'Clicks complete, ready to submit': '点击完成，可提交',
    'Clicked {{current}}/{{total}}': '已点击 {{current}}/{{total}}',
    'Enter the characters in the image': '请输入图片中的字符',
    'Enter {{length}}-character code': '请输入 {{length}} 位验证码',
    'Confirm and continue': '确认继续',
  },
  'zh-TW': {
    'Security verification': '安全驗證',
    'Complete the verification below to continue (slider, click, or image captcha may appear).':
      '請完成下方驗證後繼續（可能出現滑塊、點選或圖形驗證碼）。',
    'Failed to load captcha': '驗證碼載入失敗',
    'Refresh captcha': '換一張',
    'Slider verification': '滑塊驗證',
    'Click verification': '點選驗證',
    'Image captcha': '圖形驗證碼',
    'Hold and drag the slider to the right': '按住滑塊，拖曳到最右側',
    'Drag the slider to complete verification': '拖曳滑塊完成驗證',
    Verified: '驗證通過',
    'Please click in order: {{sequence}}': '請依序點擊：{{sequence}}',
    'Clicks complete, ready to submit': '點擊完成，可提交',
    'Clicked {{current}}/{{total}}': '已點擊 {{current}}/{{total}}',
    'Enter the characters in the image': '請輸入圖片中的字元',
    'Enter {{length}}-character code': '請輸入 {{length}} 位驗證碼',
    'Confirm and continue': '確認繼續',
  },
  fr: {
    'Security verification': 'Vérification de sécurité',
    'Complete the verification below to continue (slider, click, or image captcha may appear).':
      'Complétez la vérification ci-dessous pour continuer (curseur, clics ou captcha image possibles).',
    'Failed to load captcha': 'Échec du chargement du captcha',
    'Refresh captcha': 'Actualiser le captcha',
    'Slider verification': 'Vérification par curseur',
    'Click verification': 'Vérification par clics',
    'Image captcha': 'Captcha image',
    'Hold and drag the slider to the right': 'Maintenez et glissez le curseur vers la droite',
    'Drag the slider to complete verification': 'Glissez le curseur pour terminer la vérification',
    Verified: 'Vérifié',
    'Please click in order: {{sequence}}': "Cliquez dans l’ordre : {{sequence}}",
    'Clicks complete, ready to submit': 'Clics terminés, prêt à envoyer',
    'Clicked {{current}}/{{total}}': 'Cliqué {{current}}/{{total}}',
    'Enter the characters in the image': "Saisissez les caractères de l’image",
    'Enter {{length}}-character code': 'Saisissez le code à {{length}} caractères',
    'Confirm and continue': 'Confirmer et continuer',
  },
  ja: {
    'Security verification': 'セキュリティ確認',
    'Complete the verification below to continue (slider, click, or image captcha may appear).':
      '続行するには下の認証を完了してください（スライダー／クリック／画像認証が表示される場合があります）。',
    'Failed to load captcha': '認証コードの読み込みに失敗しました',
    'Refresh captcha': '認証を更新',
    'Slider verification': 'スライダー認証',
    'Click verification': 'クリック認証',
    'Image captcha': '画像認証',
    'Hold and drag the slider to the right': 'スライダーを右端までドラッグしてください',
    'Drag the slider to complete verification': 'スライダーをドラッグして認証を完了',
    Verified: '認証済み',
    'Please click in order: {{sequence}}': '次の順にクリックしてください：{{sequence}}',
    'Clicks complete, ready to submit': 'クリック完了、送信できます',
    'Clicked {{current}}/{{total}}': 'クリック {{current}}/{{total}}',
    'Enter the characters in the image': '画像の文字を入力してください',
    'Enter {{length}}-character code': '{{length}} 桁のコードを入力',
    'Confirm and continue': '確認して続行',
  },
  ru: {
    'Security verification': 'Подтверждение безопасности',
    'Complete the verification below to continue (slider, click, or image captcha may appear).':
      'Пройдите проверку ниже, чтобы продолжить (может появиться слайдер, клики или изображение).',
    'Failed to load captcha': 'Не удалось загрузить капчу',
    'Refresh captcha': 'Обновить капчу',
    'Slider verification': 'Проверка слайдером',
    'Click verification': 'Проверка кликами',
    'Image captcha': 'Графическая капча',
    'Hold and drag the slider to the right': 'Удерживайте и перетащите ползунок вправо',
    'Drag the slider to complete verification': 'Перетащите ползунок для завершения проверки',
    Verified: 'Подтверждено',
    'Please click in order: {{sequence}}': 'Нажмите по порядку: {{sequence}}',
    'Clicks complete, ready to submit': 'Клики завершены, можно отправить',
    'Clicked {{current}}/{{total}}': 'Нажато {{current}}/{{total}}',
    'Enter the characters in the image': 'Введите символы с изображения',
    'Enter {{length}}-character code': 'Введите код из {{length}} символов',
    'Confirm and continue': 'Подтвердить и продолжить',
  },
  vi: {
    'Security verification': 'Xác minh bảo mật',
    'Complete the verification below to continue (slider, click, or image captcha may appear).':
      'Hoàn tất xác minh bên dưới để tiếp tục (có thể hiện thanh trượt, nhấp chọn hoặc captcha ảnh).',
    'Failed to load captcha': 'Không tải được captcha',
    'Refresh captcha': 'Làm mới captcha',
    'Slider verification': 'Xác minh thanh trượt',
    'Click verification': 'Xác minh nhấp chọn',
    'Image captcha': 'Captcha hình ảnh',
    'Hold and drag the slider to the right': 'Giữ và kéo thanh trượt sang phải',
    'Drag the slider to complete verification': 'Kéo thanh trượt để hoàn tất xác minh',
    Verified: 'Đã xác minh',
    'Please click in order: {{sequence}}': 'Vui lòng nhấp theo thứ tự: {{sequence}}',
    'Clicks complete, ready to submit': 'Đã nhấp xong, sẵn sàng gửi',
    'Clicked {{current}}/{{total}}': 'Đã nhấp {{current}}/{{total}}',
    'Enter the characters in the image': 'Nhập các ký tự trong ảnh',
    'Enter {{length}}-character code': 'Nhập mã {{length}} ký tự',
    'Confirm and continue': 'Xác nhận và tiếp tục',
  },
}

let total = 0
for (const locale of locales) {
  const filePath = path.join(LOCALES_DIR, `${locale}.json`)
  const json = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  const trans = keys[locale]
  let updated = 0
  for (const [k, v] of Object.entries(trans)) {
    if (json.translation[k] !== v) {
      json.translation[k] = v
      updated++
    }
  }
  json.translation = Object.fromEntries(
    Object.entries(json.translation).sort(([a], [b]) => a.localeCompare(b))
  )
  fs.writeFileSync(filePath, JSON.stringify(json, null, 2) + '\n')
  console.log(`${locale}: ${updated}`)
  total += updated
}
console.log('total', total)
