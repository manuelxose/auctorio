#!/usr/bin/env bash
set -euo pipefail
echo '== system =='
uname -a
lscpu | grep -E '^(Architecture|CPU\(s\)|Model name|Core|Socket)' || true
free -h
df -hT /
uptime
echo '== top processes =='
ps -eo pid,ppid,user,stat,%cpu,%mem,rss,etime,comm,args --sort=-%cpu | head -25
echo '== application services =='
systemctl list-units --type=service --state=running --no-pager | grep -E 'auctorio|content-ai|guiatv|tecnoria|postgres|mongo|valkey|redis|nginx' || true
echo '== timers and user services =='
systemctl list-timers --all --no-pager || true
systemctl --user list-units --type=service --all --no-pager 2>/dev/null || true
echo '== project/storage =='
du -sh /var/www/auctorio /var/www/auctorio/storage 2>/dev/null || true
