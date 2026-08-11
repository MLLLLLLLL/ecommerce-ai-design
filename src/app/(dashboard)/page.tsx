export default function HomePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">欢迎使用电商AI工作台</h1>
        <p className="text-muted-foreground mt-2">
          Phase 3 开发完成 - 文生图模块与资源库
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-lg border p-6">
          <h3 className="font-semibold mb-2">✅ 已完成功能</h3>
          <ul className="space-y-1 text-sm text-muted-foreground">
            <li>• 文生图功能</li>
            <li>• 资源库管理</li>
            <li>• AI 服务配置</li>
            <li>• 队列管理系统</li>
            <li>• 文件存储服务</li>
          </ul>
        </div>

        <div className="rounded-lg border p-6">
          <h3 className="font-semibold mb-2">🚀 快速开始</h3>
          <ol className="space-y-1 text-sm text-muted-foreground">
            <li>1. 在设置中配置 AI 服务</li>
            <li>2. 前往文生图页面</li>
            <li>3. 输入提示词生成图片</li>
            <li>4. 在资源库中查看结果</li>
          </ol>
        </div>

        <div className="rounded-lg border p-6">
          <h3 className="font-semibold mb-2">📊 系统状态</h3>
          <ul className="space-y-1 text-sm text-muted-foreground">
            <li>• Phase 1: ✅ 完成</li>
            <li>• Phase 2: ✅ 完成</li>
            <li>• Phase 3: ✅ 完成</li>
            <li>• Phase 4: ⏳ 计划中</li>
          </ul>
        </div>
      </div>

      <div className="rounded-lg bg-blue-50 p-6 dark:bg-blue-950">
        <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
          💡 提示
        </h3>
        <p className="text-sm text-blue-800 dark:text-blue-200">
          首次使用前，请先在「设置」页面配置至少一个 AI 服务。支持 OpenAI、阿里百炼和自定义中转站。
        </p>
      </div>
    </div>
  );
}
