# 拼豆找色助手

一个本地纯前端的小工具，帮拼豆玩家快速定位图纸中各色号位于哪块板、哪一格，并记录完成进度。

## 特性
- 录入 6 块板（每块 4×6 = 24 格）的色号布局
- 录入图纸所需的色号清单（每行：色号 颗数）
- 三种视图：
  - **按板聚合**：列出本图每块板上需要用到的色号及其位置
  - **色号查找**：输入 `A1` 即时显示所在板号和行列
  - **虚拟板视图**：在 4×6 网格上直接点格子标记完成
- 整组色号标记/撤销，自动记录
- 双进度：色号进度 + 颗数进度
- 数据全部存在浏览器本地（IndexedDB），无后端、无账号、可离线

## 使用方式

### 方式一：本地静态服务器（推荐，数据可持久化）
1. 双击 `启动.ps1`（需要本机装了 Python 3）
2. 浏览器自动打开 `http://localhost:8000/`
3. 数据保存在 IndexedDB，刷新不丢

如果 `启动.ps1` 被系统策略拦截，可以在项目目录里手动执行：
```
python -m http.server 8000
```

### 方式二：双击 `index.html`（最简单，但有限制）
- 直接在文件管理器里双击 `index.html`
- 浏览器以 `file://` 协议打开，**Service Worker、PWA 安装、IndexedDB 持久化都会被禁用**
- 工具会自动降级到"内存模式"运行：UI 一切正常，但**刷新后数据会丢失**
- 适合临时试用

### 浏览器要求
支持 ES2017 / IndexedDB 的现代浏览器：
- Chrome / Edge 88+
- Firefox 78+
- Safari 14+

## 文件结构
```
perler-bead-finder/
├── index.html               # 入口
├── manifest.webmanifest     # PWA 配置
├── sw.js                    # Service Worker（缓存）
├── css/style.css            # 自定义样式
├── js/
│   ├── db.js                # IndexedDB 封装
│   ├── state.js             # 全局状态 + 工具
│   ├── parser.js            # 色号文本解析
│   ├── router.js            # 简易 hash 路由
│   ├── app.js               # 入口
│   └── views/               # 各页面视图
└── README.md
```

## 数据存储
所有数据保存在浏览器 IndexedDB 中，数据库名 `perler-bead-finder`。清除浏览器数据会清空所有图纸与板模板，请谨慎。

如需迁移或备份，建议使用浏览器自带的站点数据导出/导入（不同浏览器路径不同）。

## 扩展预留点（V1 不实现）
- `boards[i].layout.rows/cols`：未来买不同规格板时只需改 layout
- `boards[i].colorMap`：未来色号识别 / 颜色预览
- `patterns[i].templateId`：未来图纸市场
- 新增视图通过事件总线接入，不影响旧视图

## 不在 V1 范围
色号自动识别、跨设备同步、真实颜色预览、图纸市场、图纸原图导入。

## 浏览器要求
支持 ES2017 / IndexedDB / Service Worker：
- Chrome / Edge 88+
- Firefox 78+
- Safari 14+
- 移动端 Chrome / Safari 同版本要求