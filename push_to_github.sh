#!/bin/bash

echo "🚀 电商 AI 设计工作台 - GitHub 推送脚本"
echo "=========================================="
echo ""
echo "当前仓库：https://github.com/MLLLLLLLL/ecommerce-ai-design"
echo ""
echo "准备推送 12 次提交到 GitHub..."
echo ""

# 推送
git push -u origin main

if [ $? -eq 0 ]; then
    echo ""
    echo "=========================================="
    echo "✅ 成功！代码已推送到 GitHub"
    echo ""
    echo "🎉 访问你的仓库："
    echo "   https://github.com/MLLLLLLLL/ecommerce-ai-design"
    echo ""
    echo "📊 项目统计："
    echo "   - 12 次提交"
    echo "   - 58+ 个文件"
    echo "   - 8000+ 行代码"
    echo "   - 完整文档"
    echo ""
else
    echo ""
    echo "❌ 推送失败"
    echo ""
    echo "可能的原因："
    echo "1. 需要认证（请输入用户名和 token）"
    echo "2. 网络问题"
    echo "3. 权限问题"
    echo ""
    echo "解决方案："
    echo "1. 确保已生成 GitHub Personal Access Token"
    echo "2. 用户名：MLLLLLLLL"
    echo "3. 密码：粘贴你的 token"
    echo ""
fi
