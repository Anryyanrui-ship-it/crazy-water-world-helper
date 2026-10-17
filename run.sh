#!/bin/bash
# 疯狂水世界助手 启动脚本
set -u

cd "$(dirname "$0")" || exit 1

PORT="${PANEL_PORT:-3027}"

# 杀掉可能残留的旧实例（systemd / 本地多开时避免端口冲突）
for p in $(pgrep -f "fksj_multi.py" 2>/dev/null); do
    [ "$p" = "$$" ] && continue
    kill -9 "$p" 2>/dev/null
done

# 等待旧端口释放（最多 20 秒）
for _ in $(seq 1 40); do
    if ! ss -lnt 2>/dev/null | grep -q ":$PORT "; then
        break
    fi
    sleep 0.5
done

exec /usr/bin/python3 fksj_multi.py
