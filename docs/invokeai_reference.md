# InvokeAI 借鉴参考笔记

> 用途：本项目工作流/画布模块借鉴 InvokeAI（invoke-ai/InvokeAI，Apache-2.0）的设计对照笔记。
> 决策背景：ComfyUI（GPL-3.0）不可复用代码；InvokeAI 许可证商用友好、架构与本项目镜像
>（节点工作流 + 无限画布）、前端同为 React + TypeScript。
> 执行策略：借鉴自研为主、点状移植小颗粒组件；AI 执行仍走现有中转站 adapter，不接入 InvokeAI API。

## 1. InvokeAI 架构速览

- 后端：Python（FastAPI + pydantic + 队列），节点（invocations）由 Python 元数据定义，
  前端通过 `/api/v2/nodes/info` 等接口拉取节点元数据，动态渲染。
- 前端：React + TypeScript，节点图基于 @xyflow/react（React Flow v12），
  状态管理 @reduxjs/toolkit + redux-undo，实时事件 socket.io，schema 校验 zod。
- 画布：Unified Canvas 基于 Konva（与本项目的 Fabric.js 不同源，交互可借鉴、代码不可移植）。

**对本项目的启示**：
1. 节点元数据（字段类型/输入输出端口）应与执行实现分离、声明式定义 —— 对应本项目
   `getConfigSchema()` + `inputs/outputs`，本次升级为强类型 schema。
2. 前端图编辑器与执行引擎解耦 —— 本项目已有 `WorkflowEngine`（拓扑排序执行），本次将页面
   执行按钮与引擎打通。
3. Redux/socket 等重依赖是其多用户/服务端架构所需，本项目单端应用不需要，借鉴时剔除。

## 2. 节点字段类型对照

InvokeAI 的 invocation field 类型与本项目新 schema 的映射：

| InvokeAI field 类型 | 说明 | 本项目 schema 类型 |
|---|---|---|
| `IntegerFieldInput` | min/max，整数 | `integer`（min/max） |
| `FloatFieldInput` | min/max，小数 | `float`（min/max/step） |
| `StringFieldInput` | 支持 multiline | `string`（multiline） |
| `BooleanFieldInput` | 开关 | `boolean` |
| `UIComponentType.enum / choices` | 枚举下拉 | `combo`（options） |
| seed + control_after_generate | 种子 + 随机/固定切换（借鉴 ComfyUI 交互） | `seed` |
| `ImageFieldInput` | 图片输入 | `image` |
| 服务/模型选择 | 模型下拉 | `service`（选择已配置的 AI 服务） |

## 3. 类型化连线对照

- InvokeAI/React Flow：每条边校验 source/target 的字段类型是否兼容（`isValidConnection`），
  不同类型端口用颜色区分。
- 本项目落地：为端口建立类型映射（text/image/number/boolean/any），
  `src/lib/workflow/portTypes.ts` 提供 `canConnect()`，React Flow 侧通过
  `isValidConnection` 拦截非法连线。

## 4. Unified Canvas 交互借鉴点

借鉴其"生成结果与画布双向流转"的交互（不引入 Konva 代码）：

1. 生成结果一键送入画布：工作流输出节点结果 → Fabric.js `CanvasManager.addImage` 作为新图层。
2. 画布产物回传工作流：画布导出（`exportToImage`）→ 作为图片输入节点的数据源。
3. 本项目落地：`src/stores/workflowBridge.ts`（zustand 持久化队列）桥接 /workflow 与 /canvas 两个页面。

## 5. 许可证合规要求（Apache-2.0）

- 借鉴设计思路：无附加义务。
- 若移植代码片段：保留原版权头与许可证文本，并在 `NOTICE` 或 docs 中注明来源
  （Copyright Invoke AI, Inc.，Apache License 2.0）。
- 不引入其 GPL/AGPL 传染的第三方依赖。

## 6. 与本项目现有模块的落点对照

| InvokeAI 概念 | 本项目对应 | 文件 |
|---|---|---|
| invocation field schema | `NodeFieldSchema` | `src/lib/workflow/nodes/base.ts` |
| node registry / metadata | `NodeRegistry`（`getAllByCategory()` 分类展示） | `src/lib/workflow/nodes/base.ts`、`index.ts` |
| graph execution | `WorkflowEngine` | `src/lib/workflow/WorkflowEngine.ts` |
| reactflow 节点卡片/端口 | `WorkflowNodeCard` | `src/components/workflow/WorkflowNodeCard.tsx` |
| 字段表单渲染 | `NodeConfigPanel` | `src/components/workflow/NodeConfigPanel.tsx` |
| 节点库面板 | `NodePalette` | `src/components/workflow/NodePalette.tsx` |
| Unified Canvas 联动 | `workflowBridge` | `src/stores/workflowBridge.ts` |
