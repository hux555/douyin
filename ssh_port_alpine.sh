#!/bin/sh
# Alpine 一键修改 SSH 端口
# 用法：在 Alpine 机器上以 root 运行
#   sh ssh_port_alpine.sh
#   或 chmod +x ssh_port_alpine.sh && ./ssh_port_alpine.sh
# 流程（防锁死）：先让 22 和新端口同时监听，你在新窗口用新端口
# 测试登录成功，回来按回车，脚本再关掉 22 端口，只剩新端口
# 全程不用 systemctl，不用 ufw/firewalld，Alpine 用 OpenRC 的 rc-service

# ---------- 1. 必须是 root ----------
if test "$(id -u)" -ne 0; then
    echo "请用 root 运行这个脚本！"
    exit 1
fi

# ---------- 2. 必须是 Alpine，且 sshd / rc-service 存在 ----------
if test ! -f /etc/alpine-release; then
    echo "警告：这不是 Alpine 系统（没找到 /etc/alpine-release），继续可能有问题。"
    printf "确定继续吗？(y/N): "
    read confirm
    case "$confirm" in
        y|Y) ;;
        *) echo "已退出。"; exit 1 ;;
    esac
fi

if test ! -f /etc/ssh/sshd_config; then
    echo "错误：找不到 /etc/ssh/sshd_config，sshd 可能没装。"
    echo "先装一下：apk add openssh-server"
    exit 1
fi

if ! command -v rc-service >/dev/null 2>&1; then
    echo "错误：找不到 rc-service，这不是 OpenRC 系统。"
    exit 1
fi

# ---------- 3. 让用户输入想要的端口 ----------
printf "请输入新的SSH端口号 (1-65535): "
read new_port

# 只允许纯数字
case "$new_port" in
    ''|*[!0-9]*)
        echo "错误：端口必须是数字！"
        exit 1
        ;;
esac

if test "$new_port" -lt 1 || test "$new_port" -gt 65535; then
    echo "错误：端口必须在 1-65535 之间！"
    exit 1
fi

# ---------- 4. 备份配置 ----------
bak="/etc/ssh/sshd_config.bak.$(date +%Y%m%d%H%M%S)"
cp /etc/ssh/sshd_config "$bak"
echo "已备份原配置到：$bak"

# 当前生效的端口（没有写 Port 行时默认就是 22）
current_port=$(grep -E "^Port " /etc/ssh/sshd_config | head -n 1 | awk '{print $2}')
if test -z "$current_port"; then
    current_port=22
fi
echo "当前SSH端口为: $current_port"
echo "想要修改的SSH端口为: $new_port"

if test "$new_port" = "$current_port"; then
    echo "新端口和当前端口一样，不用改。"
    exit 0
fi

# ---------- 5. 先加新端口，不删旧端口（两个同时监听） ----------
# 先删掉可能重复的新端口行，避免重复
sed -i "/^Port $new_port\$/d" /etc/ssh/sshd_config

# 如果没有生效的 Port 行（只有注释的 #Port 22），先把当前端口写明
if ! grep -qE "^Port " /etc/ssh/sshd_config; then
    echo "Port $current_port" >> /etc/ssh/sshd_config
fi
echo "Port $new_port" >> /etc/ssh/sshd_config

echo "---- 临时配置（新旧端口同时监听）----"
grep -E "^Port " /etc/ssh/sshd_config

# ---------- 6. 检查配置并重启 sshd ----------
if ! sshd -t; then
    echo "错误：sshd 配置检查没通过，已恢复备份。"
    cp "$bak" /etc/ssh/sshd_config
    exit 1
fi

rc-service sshd restart
# 保证重启后 sshd 开机自启
rc-update add sshd default >/dev/null 2>&1

# ---------- 7. 检查新端口是不是真的在监听 ----------
# ss 在 Alpine 里属于 iproute2，没有就装一个；装不上就用 netstat 顶一下
if ! command -v ss >/dev/null 2>&1; then
    apk add iproute2 >/dev/null 2>&1 || true
fi

echo "---- 当前监听情况 ----"
if command -v ss >/dev/null 2>&1; then
    ss -tlnp | grep sshd || ss -tln | grep ":$new_port" || echo "注意：ss 里没看到新端口！"
elif command -v netstat >/dev/null 2>&1; then
    netstat -tlnp | grep sshd || echo "注意：netstat 里没看到 sshd！"
else
    echo "注意：没有 ss 也没有 netstat，无法自动检查监听，请手动测试登录。"
fi

# ---------- 8. 等你测试新端口，成功了再关旧端口 ----------
echo ""
echo "现在请在新窗口用 $new_port 端口登录测试一次。"
echo "测试成功后，回来按回车，脚本会关闭 $current_port 端口，只留 $new_port。"
echo "如果新端口连不上，直接按 Ctrl+C 退出，$current_port 端口还留着，不会被锁在外面。"
printf "测试成功了？按回车继续关闭旧端口："
read dummy

# ---------- 9. 只留新端口 ----------
sed -i "/^Port /d" /etc/ssh/sshd_config
echo "Port $new_port" >> /etc/ssh/sshd_config

if ! sshd -t; then
    echo "错误：最终配置检查没通过，已恢复备份。"
    cp "$bak" /etc/ssh/sshd_config
    rc-service sshd restart
    exit 1
fi

rc-service sshd restart

echo ""
echo "操作完成！"
echo "最终SSH端口为: $new_port"
grep -E "^Port " /etc/ssh/sshd_config
if command -v ss >/dev/null 2>&1; then
    ss -tlnp | grep sshd
fi
echo "请再用 $new_port 端口登录一次确认，旧端口 $current_port 已经关闭。"
