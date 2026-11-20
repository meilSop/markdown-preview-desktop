---
name: backend-create
description: "创建后端代码模块。基于项目架构规范和代码模式，生成 Spring Boot Controller、Service、Mapper、DO、VO 等后端 Java 代码。"
---

# 创建后端代码

使用 `backend-creator` 子代理按照项目架构约定和代码模式创建后端 Java 代码。

---

## 第 1 步：明确创建目标

确认用户要创建的后端模块类型：

- **完整 CRUD 模块** — Controller + Service + Mapper + DO + VO + ErrorCode（推荐）
- **Controller 层** — REST 接口 + 请求/响应 VO
- **Service 层** — 服务接口 + 实现类
- **数据访问层** — DO + Mapper
- **错误码定义** — ErrorCodeConstants 追加
- **定时任务** — Job 实现类

## 第 2 步：加载项目规范

在创建代码之前，确保了解项目架构：

1. 阅读 `.qoder/agents/backend-creator.md` 中的代码模板和命名约定
2. 阅读 `.trellis/spec/syfb-backend/backend/index.md` 了解规范索引
3. 搜索现有类似模块作为参考：
   ```bash
   # 查找已有的控制器
   ls syfb-backend/syfb-module-portal/syfb-module-portal-biz/src/main/java/com/sungrow/sgtp/module/portal/controller/admin/
   # 查找已有的服务
   ls syfb-backend/syfb-module-portal/syfb-module-portal-biz/src/main/java/com/sungrow/sgtp/module/portal/service/
   ```
4. 确认包路径基础：`com.sungrow.sgtp.module.portal`

## 第 3 步：调度 backend-creator 子代理

使用 `backend-creator` 子代理执行代码创建。提供以下上下文：

- 目标模块名称和描述
- 数据模型（表名、字段）
- 业务逻辑和校验规则
- 参考的现有模块（如有）

## 第 4 步：验证创建的代码

创建完成后，按层级检查：

### Controller 层
- [ ] 类注解齐全：`@Tag`、`@RestController`、`@RequestMapping("/syfb/{module}")`、`@Validated`
- [ ] 所有方法返回 `CommonResult<T>`
- [ ] 使用 `@Operation(summary = "...")` 描述每个接口
- [ ] 使用 `@Parameter` / `@Schema` 描述参数
- [ ] 创建使用 `ValidatedGroup.CREATE`，更新使用 `ValidatedGroup.UPDATE`
- [ ] 无业务逻辑，仅委托 Service

### Service 层
- [ ] 接口方法有 Javadoc 注释
- [ ] 实现类标注 `@Service` + `@Validated`
- [ ] update/delete 操作先调用 `validateXxxExists()`
- [ ] 对象转换使用 `BeanUtils.toBean()`
- [ ] 异常使用 `ServiceExceptionUtil.exception(ErrorCodeConstants.XXX)`

### 数据访问层
- [ ] DO 继承 `BaseDO`，标注 `@TableName("syfb_xxx")` + `@KeySequence("syfb_xxx_seq")`
- [ ] DO 使用 Lombok 注解：`@Data`、`@EqualsAndHashCode(callSuper = true)`、`@ToString(callSuper = true)`、`@Builder`、`@NoArgsConstructor`、`@AllArgsConstructor`
- [ ] Mapper 继承 `BaseMapperX<T>`，标注 `@Mapper`
- [ ] 分页查询使用 `LambdaQueryWrapperX` + `xxxIfPresent()` 方法
- [ ] 默认 `orderByDesc(XxxDO::getId)`

### VO 层
- [ ] SaveReqVO 的 id 字段使用 `@NotNull`(UPDATE) + `@Null`(CREATE) 分组校验
- [ ] PageReqVO 继承 `PageParam`
- [ ] RespVO 标注 `@ExcelIgnoreUnannotated` + `@ExcelProperty`
- [ ] 所有字段有 `@Schema` 注解

### 错误码
- [ ] 在 `ErrorCodeConstants` 中追加，遵循 `1-0XX-YYY-ZZZ` 分段格式
- [ ] 错误码放在 `-api` 子模块的 `enums/` 包下

## 第 5 步：后续步骤

根据创建的模块类型，提醒用户完成后续工作：

- **新建模块** → 创建数据库表（`syfb_xxx`）
- **新建模块** → 分配错误码段
- **新建模块** → 配置权限标识（`dhr:xxx:create/update/delete/query/export`）
- **API 变更** → 通知前端开发者接口变更
- **定时任务** → 在管理后台配置任务调度

---

## 参考

- 编码规范详情: `.qoder/agents/backend-creator.md`
- 后端目录结构: `.trellis/spec/syfb-backend/backend/directory-structure.md`
- 数据库规范: `.trellis/spec/syfb-backend/backend/database-guidelines.md`
- 异常处理: `.trellis/spec/syfb-backend/backend/error-handling.md`
- 质量规范: `.trellis/spec/syfb-backend/backend/quality-guidelines.md`
- 日志规范: `.trellis/spec/syfb-backend/backend/logging-guidelines.md`

## 实际执行

- 当用户输入 `/backend-creator <任务描述>` 时，按照上述流程分析需求、探索代码、声明式开发、实现逻辑，并确保输出符合规范。
- 阅读 `.document/{任务描述}.md` 文件，了解详细执行流程和输出规范并执行。

## 上下文保存

- 将新开发的功能模块的目录结构自动更新到.trellis/spec/syfb-backend/beckend 架构文档中。
- 将分析到的代码注释、接口文档、文案翻译等信息也保存到知识库文档中。
- 将此次开发的技术决策更新保存到技术决策文档中。
- 当会话记录自动更新保存到会话记录中。
- 当历史会话记录过大时，自动压缩历史会话记录，保留最近一次会话记录。
