const { cpSync, copyFileSync, mkdirSync } = require('fs')
const path = require('path')

const output = path.join(__dirname, '../dist')

mkdirSync(output, { recursive: true })
for (const file of ['manifest.json', 'settings.html', 'icon.png', 'FrameLogo.png']) {
  copyFileSync(path.join(__dirname, file), path.join(output, file))
}

cpSync(path.join(__dirname, 'icons'), path.join(output, 'icons'), { recursive: true })
cpSync(path.join(__dirname, 'style'), path.join(output, 'style'), { recursive: true })
