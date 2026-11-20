# 质量规范

> 后端开发的代码质量标准。

---

## 概述

后端遵循由 `sgtp` 框架约定强制执行的严格分层架构。通过标准化的依赖注入、对象转换、参数校验和 API 文档模式来保证代码质量。

---

## 禁止使用的模式

### 依赖注入

- **禁止 `@Autowired`**：始终使用 `@Resource` 进行依赖注入
- **禁止构造器注入**：使用 `@Resource` 的字段注入是项目标准

### 控制器层

- **禁止在控制器中编写业务逻辑**：控制器仅负责请求解析、VO 转换和委托给 Service
- **禁止控制器直接访问 Mapper**：必须通过 Service 层
- **禁止原始返回类型**：所有接口必须返回 `CommonResult<T>`

### 服务层

- **禁止跳过存在性校验**：update/delete 操作前必须调用 `validateXxxExists()`
- **禁止直接处理 HTTP 请求/响应**：Service 方法必须与 HTTP 无关

### 数据访问层

- **禁止原始 SQL 字符串**：使用 `LambdaQueryWrapperX` 配合类型安全的方法引用
- **标准查询禁止使用 XML mapper 文件**：在 Mapper 接口中使用 `default` 方法
- **禁止绕过逻辑删除**：始终使用框架的软删除机制

### 对象转换

- **禁止手动逐字段复制**：始终使用 `BeanUtils.toBean(source, TargetClass.class)`
- **禁止控制器返回 DO 对象**：返回前必须转换为 RespVO

---

## 必须遵循的模式

### 控制器 CRUD 标准

```java
@Tag(name = "管理后台 - {module}")
@RestController
@RequestMapping("/syfb/{module}")
@Validated
public class XxxController {

    @Resource
    private XxxService xxxService;

    @PostMapping("/create")
    @Operation(summary = "创建xxx")
    public CommonResult<Long> createXxx(@Validated(ValidatedGroup.CREATE.class) @RequestBody XxxSaveReqVO createReqVO) {
        return success(xxxService.createXxx(createReqVO));
    }

    @PostMapping("/update")
    @Operation(summary = "修改xxx")
    public CommonResult<Boolean> updateXxx(@Validated(ValidatedGroup.UPDATE.class) @RequestBody XxxSaveReqVO updateReqVO) {
        xxxService.updateXxx(updateReqVO);
        return success(true);
    }

    @PostMapping("/delete")
    @Operation(summary = "删除xxx")
    public CommonResult<Boolean> deleteXxx(@Valid @RequestBody DeleteByIdsVO deleteReqVO) {
        xxxService.deleteXxx(deleteReqVO.getIds());
        return success(true);
    }

    @GetMapping("/get")
    @Operation(summary = "获取xxx")
    @Parameter(name = "id", description = "编号", required = true)
    public CommonResult<XxxRespVO> getXxx(@RequestParam("id") Long id) {
        XxxDO xxx = xxxService.getXxx(id);
        return success(BeanUtils.toBean(xxx, XxxRespVO.class));
    }

    @PostMapping("/page")
    @Operation(summary = "获取xxx分页")
    public CommonResult<PageResult<XxxRespVO>> getXxxPage(@Valid @RequestBody XxxPageReqVO pageReqVO) {
        PageResult<XxxDO> pageResult = xxxService.getXxxPage(pageReqVO);
        return success(BeanUtils.toBean(pageResult, XxxRespVO.class));
    }
}
```

### API 文档

- 所有控制器必须有 `@Tag` 用于分组
- 所有接口必须有 `@Operation(summary = "...")`
- 所有参数必须有 `@Parameter` 或 `@Schema` 注解

### 审计日志

- 在需要操作日志追踪的 VO 字段上使用 `@DiffLogField(name = "字段描述")`
- 在 `LogRecordConstants` 中使用 SpEL 表达式定义日志模板

---

## 代码审查清单

- [ ] 控制器在类级别使用 `@Validated`
- [ ] 所有接口返回 `CommonResult<T>`
- [ ] VO ↔ DO 转换使用 `BeanUtils.toBean()`
- [ ] update/delete 方法先验证实体是否存在
- [ ] 错误码遵循 `1-0XX-YYY-ZZZ` 分段模式
- [ ] 使用 `@Resource` 而非 `@Autowired`
- [ ] API 文档注解齐全（`@Tag`、`@Operation`、`@Parameter`）
- [ ] 控制器中无业务逻辑
- [ ] Mapper 使用 `LambdaQueryWrapperX` 配合 `xxxIfPresent()` 方法
- [ ] DO 继承 `BaseDO`，并正确配置 `@TableName` 和 `@KeySequence`
