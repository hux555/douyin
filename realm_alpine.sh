#!/bin/sh
# realm Alpine 一键脚本（OpenRC + musl 版）
#
# 用法：把文件传到 Alpine 主机上，root 运行：
#   sh realm_alpine.sh
# 然后按菜单选：1 安装，2 加规则，4 看状态，5 重启，7 卸载
#
# 跟原版 RealmOneKey.sh 的区别：
#   原版用 systemctl 管服务、下载 glibc 版 realm，Alpine 上两样都没有；
#   这个版本全程用 rc-service / rc-update，下载的是 musl 版 realm。
#
# 安装位置（跟你现在这台 Alpine 上的布局一致）：
#   程序和配置：/root/realm/realm、/root/realm/config.toml
#   OpenRC 服务：/etc/init.d/realm（rc-service realm restart 就能重启，开机自启）

# 默认版本：如果取不到最新版就用这个兜底
REALM_VER="v2.9.6"
REALM_DIR="${REALM_DIR:-/root/realm}"
INITD_DIR="${INITD_DIR:-/etc/init.d}"
SERVICE_FILE="$INITD_DIR/realm"
CONFIG="$REALM_DIR/config.toml"
BIN="$REALM_DIR/realm"
URL="https://github.com/zhboner/realm/releases/download/$REALM_VER/realm-x86_64-unknown-linux-musl.tar.gz"

# ---------- 读一行输入（有些终端 stdin 一开始就是 EOF，直接 read 会立刻读到空串） ----------
read_line() {
    # $1 = 要存入的变量名
    if [ -t 0 ]; then
        read "$1"
        return $?
    fi
    if read "$1" 2>/dev/null < /dev/tty; then
        return 0
    fi
    read "$1"
}

# ---------- 取官方最新版本号（运行安装时才去问 GitHub） ----------
# 用 releases/latest 的跳转地址取 tag，不走 API，不怕限流；
# 取不到就回落到默认的 v2.9.6，不会因为网络问题装不上。
resolve_version() {
    latest=""
    latest=$(curl -sL -o /dev/null -w "%{url_effective}" --max-time 15 "https://github.com/zhboner/realm/releases/latest" 2>/dev/null)
    case "$latest" in
        */tag/v*) REALM_VER="${latest##*/tag/}" ;;
        *) REALM_VER="v2.9.6" ;;
    esac
    URL="https://github.com/zhboner/realm/releases/download/$REALM_VER/realm-x86_64-unknown-linux-musl.tar.gz"
    echo "官方最新版本：$REALM_VER"
}

need_root() {
    if [ "$(id -u)" -ne 0 ]; then
        echo "请用 root 运行这个脚本！"
        exit 1
    fi
}

install_deps() {
    echo "安装依赖：curl tar iproute2 ..."
    apk add curl tar iproute2
}

# ---------- 写 OpenRC 服务文件 ----------
write_service() {
    mkdir -p "$INITD_DIR"
    cat > "$SERVICE_FILE" <<EOF
#!/sbin/openrc-run
name="realm"
description="Realm TCP/UDP port forwarding"
command="$BIN"
command_args="-c $CONFIG"
command_background=true
pidfile="/run/realm.pid"
output_log="/var/log/realm.log"
error_log="/var/log/realm.log"

depend() {
    need net
    after firewall
}
EOF
    chmod +x "$SERVICE_FILE"
    echo "已写服务文件：$SERVICE_FILE"
}

# ---------- 加一条转发规则（追加到 config.toml 末尾） ----------
add_rule() {
    listen=""
    remote=""
    printf "监听地址:端口（直接回车默认 0.0.0.0:33748；要同时监听 IPv6 写 [::]:33748）："
    read_line listen
    [ -z "$listen" ] && listen="0.0.0.0:33748"
    while [ -z "$remote" ]; do
        printf "转发目标（格式 主机:端口，例如 ipv6-aktw.4465656.xyz:33748）："
        read_line remote
    done
    {
        echo ""
        echo "[[endpoints]]"
        echo "listen = \"$listen\""
        echo "remote = \"$remote\""
    } >> "$CONFIG"
    echo "已添加：$listen -> $remote"
}

# ---------- 没有配置文件时，引导建第一条规则；已有配置不动 ----------
ensure_config() {
    if [ -f "$CONFIG" ]; then
        echo "已有配置文件：$CONFIG（保留不动）"
        return 0
    fi
    echo "还没有转发规则，先加一条："
    add_rule
}

show_config() {
    if [ -f "$CONFIG" ]; then
        echo "---- $CONFIG ----"
        cat "$CONFIG"
    else
        echo "还没有配置文件，先选 1 安装。"
    fi
}

show_status() {
    rc-service realm status
    echo "---- 监听端口 ----"
    if command -v ss >/dev/null 2>&1; then
        ss -tlnp | grep realm || echo "（没有 realm 在监听的 TCP 端口）"
    elif command -v netstat >/dev/null 2>&1; then
        netstat -tlnp | grep realm || echo "（没有 realm 在监听的 TCP 端口）"
    else
        echo "没有 ss 也没有 netstat，无法检查监听。"
    fi
    echo "---- 最近日志 ----"
    tail -n 20 /var/log/realm.log 2>/dev/null || echo "（没有日志文件）"
}

# ---------- 1. 安装 / 更新 ----------
do_install() {
    install_deps
    resolve_version
    mkdir -p "$REALM_DIR"
    # 先备份正在用的旧版，万一新版有问题，一条 cp 就能回去
    if [ -x "$BIN" ]; then
        bak="$BIN.bak.$(date +%Y%m%d%H%M%S)"
        cp "$BIN" "$bak"
        echo "已备份旧版到：$bak"
    fi
    tmpf="/tmp/realm-$REALM_VER.tar.gz"
    echo "下载 realm $REALM_VER（musl 版）..."
    echo "下载地址：$URL"
    if ! curl -sSL --retry 2 -o "$tmpf" "$URL"; then
        echo "下载失败，检查网络或 GitHub 是否可达。"
        return 1
    fi
    if ! tar -tzf "$tmpf" | grep -qx "realm"; then
        echo "下载到的包里没有 realm 程序，可能这个版本没有 musl 包，停止安装，旧版没动。"
        rm -f "$tmpf"
        return 1
    fi
    tar -xzf "$tmpf" -C "$REALM_DIR" || { echo "解压失败。"; return 1; }
    rm -f "$tmpf"
    chmod +x "$BIN"
    "$BIN" --version 2>/dev/null || echo "（realm 已解压，版本号没打出来，不影响使用）"
    write_service
    ensure_config
    # 接管之前 nohup 跑的老进程，避免它占着端口让服务起不来
    pkill realm 2>/dev/null
    sleep 1
    rc-update add realm default
    rc-service realm restart
    sleep 1
    show_status
}

# ---------- 7. 卸载 ----------
do_uninstall() {
    printf "确定卸载 realm 吗？这会停掉服务并删除 $REALM_DIR 和服务文件 (y/N): "
    read_line confirm
    case "$confirm" in
        y|Y) ;;
        *) echo "已取消。"; return 0 ;;
    esac
    rc-service realm stop 2>/dev/null
    rc-update del realm default 2>/dev/null
    rm -f "$SERVICE_FILE"
    rm -rf "$REALM_DIR"
    echo "已卸载。"
}

# ---------- 菜单 ----------
menu() {
    while true; do
        echo ""
        echo "======== realm Alpine 一键脚本 ($REALM_VER) ========"
        echo "1. 安装 / 更新 realm（musl 版 + OpenRC 服务）"
        echo "2. 添加一条转发规则"
        echo "3. 查看转发规则"
        echo "4. 查看运行状态"
        echo "5. 重启 realm"
        echo "6. 停止 realm"
        echo "7. 卸载 realm"
        echo "0. 退出"
        printf "选一个 [0-7]: "
        read_line choice
        case "$choice" in
            1) do_install ;;
            2)
                add_rule
                if [ -f "$SERVICE_FILE" ]; then
                    rc-service realm restart
                else
                    echo "服务还没装，规则已保存，选 1 安装后生效。"
                fi
                ;;
            3) show_config ;;
            4) show_status ;;
            5) rc-service realm restart; show_status ;;
            6) rc-service realm stop ;;
            7) do_uninstall ;;
            0) echo "退出。"; exit 0 ;;
            *) echo "无效选择，输入 0-7。" ;;
        esac
    done
}

# ---------- 入口 ----------
need_root
if [ ! -f /etc/alpine-release ]; then
    echo "警告：这不是 Alpine 系统（没找到 /etc/alpine-release）。"
    printf "确定继续吗？(y/N): "
    read_line confirm
    case "$confirm" in
        y|Y) ;;
        *) echo "已退出。"; exit 1 ;;
    esac
fi
menu
