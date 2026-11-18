#!/bin/sh

# Ubuntu/Debian 一键修改 SSH 端口
#
# 用法（两种，任选其一）：
#   sh ssh_port_ubuntu.sh 28467     # 端口直接写在命令里，不用等输入
#   sh ssh_port_ubuntu.sh           # 再手动输入端口
#
# 流程（防锁死）：先让 22 和新端口同时监听，你在新窗口用新端口
# 测试登录成功，回来按回车，脚本再关掉 22 端口，只剩新端口
#
# Ubuntu 特别注意：systemd 的 ssh.socket 会抢占 22 端口（socket 激活），
# 只改 sshd_config 不停 socket 的话，改完端口还是 22。
# 所以脚本会自动停用并屏蔽 ssh.socket，让 sshd 自己按配置监听。
# 另外如果 ufw 是开启状态，脚本会自动放行新端口，避免被防火墙拦住。

# ---------- 0. 读一行输入 ----------
# 有些终端/面板里 stdin 一开始就是 EOF，直接 read 会立刻读到空串，
# 表现为“还没输入就报错”。所以先试 /dev/tty（真正的终端），
# 没有终端再回落到 stdin。
read_line() {
    # $1 = 要存入的变量名
    if test -t 0; then
        read "$1"
        return $?
    fi
    if read "$1" 2>/dev/null < /dev/tty; then
        return 0
    fi
    read "$1"
}

# ---------- 1. 必须是 root ----------
if test "$(id -u)" -ne 0; then
    echo "请用 root 运行这个脚本！"
    exit 1
fi

# ---------- 2. 必须是 systemd 的 Ubuntu/Debian，且 sshd 存在 ----------
if ! command -v systemctl >/dev/null 2>&1; then
    echo "错误：找不到 systemctl，这不是 systemd 系统。"
    exit 1
fi

# 读系统 ID，Ubuntu/Debian 直接放行，其他系统提示确认
os_id=""
if test -f /etc/os-release; then
    os_id=$(grep -E "^ID=" /etc/os-release | cut -d= -f2 | tr -d '"')
fi
case "$os_id" in
    ubuntu|debian) ;;
    *)
        echo "警告：这不是 Ubuntu/Debian 系统（ID=$os_id），继续可能有问题。"
        printf "确定继续吗？(y/N): "
        read_line confirm
        case "$confirm" in
            y|Y) ;;
            *) echo "已退出。"; exit 1 ;;
        esac
        ;;
esac

if test ! -f /etc/ssh/sshd_config; then
    echo "错误：找不到 /etc/ssh/sshd_config，sshd 可能没装。"
    echo "先装一下：apt-get install -y openssh-server"
    exit 1
fi

# 找到 ssh 服务名：Ubuntu 上通常是 ssh，也有 sshd
svc=""
if systemctl cat ssh.service >/dev/null 2>&1; then
    svc="ssh"
elif systemctl cat sshd.service >/dev/null 2>&1; then
    svc="sshd"
else
    echo "错误：找不到 ssh/sshd 服务。"
    exit 1
fi
echo "SSH 服务名：$svc"

# ---------- 3. 新端口：优先用命令行参数，其次交互输入 ----------
new_port="$1"
if test -z "$new_port"; then
    tries=0
    while test "$tries" -lt 3; do
        printf "请输入新的SSH端口号 (1-65535): "
        if ! read_line new_port; then
            echo ""
            echo "错误：读不到输入（当前终端没有交互输入）。"
            echo "请改用参数形式：sh ssh_port_ubuntu.sh 28467"
            exit 1
        fi
        case "$new_port" in
            ''|*[!0-9]*)
                echo "错误：端口必须是数字！"
                new_port=""
                tries=$((tries + 1))
                continue
                ;;
        esac
        if test "$new_port" -lt 1 || test "$new_port" -gt 65535; then
            echo "错误：端口必须在 1-65535 之间！"
            new_port=""
            tries=$((tries + 1))
            continue
        fi
        break
    done
    if test -z "$new_port"; then
        echo "错误：连续 3 次没有输入有效端口，退出。"
        exit 1
    fi
else
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

# ---------- 6. 处理 ssh.socket（Ubuntu 关键一步） ----------
# systemd 的 ssh.socket 会抢占 22 端口，不停它的话改端口不生效。
# 之前 vps1000000097 改 18383 失败就是这个原因：配置写对了，但 22 还被 socket 占着。
if systemctl cat ssh.socket >/dev/null 2>&1; then
    if systemctl is-enabled ssh.socket >/dev/null 2>&1 || systemctl is-active ssh.socket >/dev/null 2>&1; then
        echo "检测到 ssh.socket（systemd socket 激活）正在占用 22 端口，先停用它，否则改端口不生效。"
        systemctl stop ssh.socket
        systemctl disable ssh.socket
        systemctl mask ssh.socket
        echo "已停用并屏蔽 ssh.socket（以后想恢复：systemctl unmask ssh.socket; systemctl enable --now ssh.socket）。"
    fi
fi

# ---------- 7. 检查配置并重启 sshd ----------
if ! sshd -t; then
    echo "错误：sshd 配置检查没通过，已恢复备份。"
    cp "$bak" /etc/ssh/sshd_config
    exit 1
fi

systemctl restart "$svc"
# 保证重启后 sshd 开机自启
systemctl enable "$svc" >/dev/null 2>&1

# ---------- 8. ufw 如果开着，放行新端口 ----------
if command -v ufw >/dev/null 2>&1; then
    if ufw status 2>/dev/null | grep -qi "^Status: active"; then
        echo "检测到 ufw 已启用，正在放行新端口 $new_port/tcp ..."
        ufw allow "$new_port"/tcp >/dev/null 2>&1
        echo "已放行 $new_port/tcp（旧端口 $current_port 的规则先保留，确认新端口能用后再手动删）。"
    fi
fi

# ---------- 9. 检查新端口是不是真的在监听 ----------
# ss 在 Ubuntu 里属于 iproute2，一般默认就装了
echo "---- 当前监听情况 ----"
if command -v ss >/dev/null 2>&1; then
    ss -tlnp | grep sshd || ss -tln | grep ":$new_port" || echo "注意：ss 里没看到新端口！"
elif command -v netstat >/dev/null 2>&1; then
    netstat -tlnp | grep sshd || echo "注意：netstat 里没看到 sshd！"
else
    echo "注意：没有 ss 也没有 netstat，无法自动检查监听，请手动测试登录。"
fi

# ---------- 10. 等你测试新端口，成功了再关旧端口 ----------
echo ""
echo "现在请在新窗口用 $new_port 端口登录测试一次。"
echo "测试成功后，回来按回车，脚本会关闭 $current_port 端口，只留 $new_port。"
echo "如果新端口连不上，直接按 Ctrl+C 退出，$current_port 端口还留着，不会被锁在外面。"
echo "注意：云服务器（阿里云/腾讯云等）还要在控制台安全组里放行 $new_port 端口，否则外网连不上。"
printf "测试成功了？按回车继续关闭旧端口："
if ! read_line dummy; then
    echo ""
    echo "没有收到确认，旧端口 $current_port 保持开启，不做任何改动，退出。"
    echo "想继续关旧端口时，重新运行一次脚本即可。"
    exit 0
fi

# ---------- 11. 只留新端口 ----------
sed -i "/^Port /d" /etc/ssh/sshd_config
echo "Port $new_port" >> /etc/ssh/sshd_config

if ! sshd -t; then
    echo "错误：最终配置检查没通过，已恢复备份。"
    cp "$bak" /etc/ssh/sshd_config
    systemctl restart "$svc"
    exit 1
fi

systemctl restart "$svc"

echo ""
echo "操作完成！"
echo "最终SSH端口为: $new_port"
grep -E "^Port " /etc/ssh/sshd_config
if command -v ss >/dev/null 2>&1; then
    ss -tlnp | grep sshd
fi
echo "请再用 $new_port 端口登录一次确认，旧端口 $current_port 已经关闭。"
echo "云服务器记得在控制台安全组里放行 $new_port，并删除旧端口 $current_port 的放行规则。"
