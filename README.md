# 疯狂水世界助手（Crazy Water World Helper）

一个面向手游《疯狂水世界》的**只读挂机助手**。它模拟游戏客户端的 WebSocket 协议连接，自动完成登录、心跳保活与只读数据拉取，并提供本地 Web 面板集中管理多个账号、查看资源 / 工厂 / 任务 / 主线进度。

> ⚠️ 本项目仅供协议学习与技术研究。使用前请确认遵守游戏官方服务条款与当地法律法规；本工具默认只发送只读查询，不包含任何破坏性写操作。

## 功能特性

- **自助绑定账号**：抓取一次游戏登录帧（LoginRequest）即可自动建号，用户只需开抓包进一次游戏。
- **多账号独立连接**：每个账号一条 WebSocket 会话，独立登录 → 拉取只读数据 → 心跳保活 → 掉线重连。
- **只读设计**：除登录 / 心跳 / Ack 与只读查询外，不发送任何写操作。
- **本地 Web 面板**：运行概览、账号管理、任务队列、资源概览、工厂与建筑、运行日志等。
- **官方账号登录**：通过自建渠道适配服务完成官方游戏账号鉴权后导入（需自行配置上游服务）。

## 目录结构

```
.
├── fksj_multi.py          # 主程序：协议实现 + 多账号会话 + Web 面板（自包含）
├── proto_defs.json        # 游戏协议字段定义
├── world_map_res.json     # 世界地图静态数据
├── panel2.html            # 面板回退页面
├── upload.html            # 手机抓包上传页
├── dist/                  # 面板前端（HTML / JS / CSS）
├── run.sh                 # 启动脚本
└── requirements.txt       # 运行依赖
```

## 环境要求

- Python 3.7+
- 依赖见 `requirements.txt`（`pycryptodome`、`qrcode`）

```bash
pip3 install -r requirements.txt
```

## 快速开始

```bash
# 1. 安装依赖
pip3 install -r requirements.txt

# 2.（可选）设置环境变量
export PANEL_PORT=3027          # 面板端口，默认 3027
export GAME_DID=00000000000000000000000000000000   # 游戏客户端设备 DID
export PANEL_TOKEN=             # 面板访问口令（留空则关闭口令校验）

# 3. 启动
bash run.sh
# 或直接
python3 fksj_multi.py
```

启动后浏览器访问 `http://127.0.0.1:3027` 打开面板。

## 配置说明

| 环境变量 | 说明 | 默认值 |
| --- | --- | --- |
| `PANEL_PORT` | Web 面板监听端口 | `3027` |
| `PING_INTERVAL` | 心跳间隔（秒） | `2.0` |
| `GAME_DID` | 游戏客户端设备 DID（抓包可得） | `0000...`（占位） |
| `PANEL_TOKEN` | 面板 / 上传口令（留空关闭口令校验） | 空 |
| `CAPTURE_GLOB` | 抓包登录帧文件的 glob 路径 | `/opt/wsdump/logs/frames-*.jsonl` |
| `CHANNEL_UPSTREAM_BASE` | 渠道适配服务地址（官方账号登录用） | 空（未配置则禁用） |
| `CHANNEL_UPSTREAM_USER` | 渠道适配服务用户名 | 空 |
| `CHANNEL_UPSTREAM_PASSWORD` | 渠道适配服务密码 | 空 |

## 账号导入

1. **抓包导入（推荐）**：在手机上抓取一次游戏登录，把包含 `LoginRequest` 的帧上传到面板即可自动建号。
2. **官方账号登录**：在面板「添加账号」中输入官方游戏账号 / 密码，由自建渠道适配服务完成鉴权后导入（需自行实现并配置 `CHANNEL_UPSTREAM_BASE` 等服务）。

## 免责声明

本项目仅用于个人学习游戏协议与网络编程技术，不提供任何破坏游戏平衡、绕过付费或盗取数据的能力。使用者应自行承担因使用本工具产生的一切后果。

## 许可证

见 [LICENSE](LICENSE)。
