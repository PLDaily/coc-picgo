# coc-picgo

[PicGo](https://github.com/Molunerfinn/PicGo) extension for coc.nvim, forked from [vs-picgo](https://github.com/PicGo/vs-picgo)

## Install

`:CocInstall coc-picgo`

## Features

<details>
<summary>Uploading an image from clipboard</summary>
<img src="https://raw.githubusercontent.com/PLDaily/coc-picgo/master/images/clipboard.gif" alt="clipboard.gif">
</details>

<details>
<summary>Uploading images from input box</summary>
<img src="https://raw.githubusercontent.com/PLDaily/coc-picgo/master/images/inputbox.gif" alt="inputbox.gif">
</details>

<details>
<summary>Use selection text as the uploaded <code>fileName</code></summary>
<img src="https://raw.githubusercontent.com/PLDaily/coc-picgo/master/images/selection.gif" alt="selection.gif">
<b>Notice: These characters: <code>\$</code>, <code>:</code>, <code>/</code>, <code>?</code> and newline will be ignored in the image name. </b>(Because they are invalid for file names.)
</details>

## Usage

```
xmap <leader>a  <Plug>(coc-codeaction-selected)
```

## License

MIT

---

> This extension is created by [create-coc-extension](https://github.com/fannheyward/create-coc-extension)
