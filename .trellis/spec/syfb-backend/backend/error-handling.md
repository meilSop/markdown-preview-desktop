# 异常处理

> 本项目中异常的处理方式。

---

## 概述

项目采用基于 `sgtp` 框架的**集中式异常处理**模式。业务错误定义为 `ErrorCode` 常量，通过 `ServiceExceptionUtil.exception()` 抛出，由框架的 `GlobalExceptionHandler` 自动捕获并封装为统一的 `CommonResult` 响应。

**控制器中不使用 try-catch**——异常自然传播到全局处理器。

---

## 错误类型

### ErrorCode 定义

错误以 `ErrorCode` 对象（错误码 + 错误消息）的形式定义在 `ErrorCodeConstants` 接口中：

```java
public interface ErrorCodeConstants extends GlobalErrorCodeConstants {

    // ========== 合同管理 1-020-000-000 ==========
    ErrorCode CONTRACT_NOT_EXISTS = new ErrorCode(1_020_000_000, "合同不存在");

    // ========== 线索管理 1-020-001-000 ==========
    ErrorCode CLUE_NOT_EXISTS = new ErrorCode(1_020_001_000, "线索不存在");

    // ========== Demo 1_020_100_001 ==========
    ErrorCode DEMO_NOT_EXISTS = new ErrorCode(1_020_100_001, "syfb_demo不存在");
}
```

### 错误码分段规则

格式：`1-0XX-YYY-ZZZ`

| 段    | 含义            | 示例           |
| ----- | --------------- | -------------- |
| `1`   | 固定前缀        | 始终为 `1`     |
| `0XX` | 模块编号        | `020` = portal |
| `YYY` | 子模块/实体编号 | `000` = 合同   |
| `ZZZ` | 错误序号        | `001` = 不存在 |

每个新的业务实体拥有独立的子模块范围，以避免编码冲突。

### 错误码位置

- **模块级错误**：`{module}-api/src/main/java/.../enums/ErrorCodeConstants.java`
- **全局错误**：`GlobalErrorCodeConstants`（来自 `sgtp` 框架）——涵盖通用场景，如未授权、禁止访问、未找到等

---

## 异常处理模式

### 抛出业务异常

始终在 **Service 层**抛出，绝不在 Controller 中抛出：

```java
// 在 ServiceImpl 中
private void validateDemoExists(Long id) {
    if (demoMapper.selectById(id) == null) {
        throw ServiceExceptionUtil.exception(ErrorCodeConstants.DEMO_NOT_EXISTS);
    }
}
```

### 先校验再操作模式

每个 `update` 和 `delete` 操作必须先验证实体是否存在：

```java
@Override
public void updateDemo(DemoSaveReqVO updateReqVO) {
    validateDemoExists(updateReqVO.getId());   // 先校验
    DemoDO updateObj = BeanUtils.toBean(updateReqVO, DemoDO.class);
    demoMapper.updateById(updateObj);
}
```

### 异常传播流程

```
Service 抛出 ServiceException
    → GlobalExceptionHandler 捕获
    → 封装为 CommonResult(code, message)
    → 以 JSON 形式返回给客户端
```

---

## API 错误响应

所有错误以 `CommonResult<T>` 形式返回，状态为非成功：

```json
{
    "code": 1020000000,
    "data": null,
    "msg": "合同不存在"
}
```

- `code`：来自 `ErrorCode` 的数字错误码
- `msg`：可读的错误消息
- `data`：错误响应时始终为 `null`

成功响应使用 `code: 0`：

```json
{
    "code": 0,
    "data": { ... },
    "msg": ""
}
```

---

## 参数校验错误

由框架通过 `@Validated` / `@Valid` 注解自动处理：

- **分组校验**：使用 `ValidatedGroup.CREATE` / `ValidatedGroup.UPDATE` 对同一 VO 应用不同的校验规则
- **字段级**：标准 JSR-303 注解（`@NotNull`、`@NotEmpty`、`@Size` 等）
- **错误格式**：框架自动收集字段错误并以 `CommonResult` 形式返回

```java
@NotNull(message = "主键id不能为空", groups = {ValidatedGroup.UPDATE.class})
@Null(message = "主键id需为空", groups = {ValidatedGroup.CREATE.class})
private Long id;
```

---

## 常见错误

1. **抛出原始异常**：绝不使用 `throw new RuntimeException(...)`。始终使用 `ServiceExceptionUtil.exception(ErrorCodeConstants.XXX)`
2. **在 Controller 中捕获异常**：不要在控制器中添加 try-catch——让全局处理器统一管理响应
3. **硬编码错误码**：始终引用 `ErrorCodeConstants` 字段，绝不直接使用数字编码
4. **跳过存在性校验**：每个 update/delete 操作必须先调用 `validateXxxExists()`
5. **添加错误码时不分段**：严格遵循 `1-0XX-YYY-ZZZ` 模式，避免编码冲突
