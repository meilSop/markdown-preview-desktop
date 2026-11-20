# 日志规范

> 本项目的日志记录方式。

---

## 概述

项目使用 **SLF4J** 配合 **Logback** 作为日志实现。Lombok 的 `@Slf4j` 注解是获取日志记录器的标准方式。框架通过 `bizlog-sdk` 提供 API 访问日志和业务级操作审计日志的结构化日志功能。

**日志输出路径**：`${user.home}/logs/${spring.application.name}.log`

---

## 日志级别

| 级别    | 使用场景                                 | 示例                                                                   |
| ------- | ---------------------------------------- | ---------------------------------------------------------------------- |
| `DEBUG` | 仅开发环境诊断，UAT/生产环境禁用         | 开发过程中的变量值                                                     |
| `INFO`  | 正常业务操作、定时任务执行、系统生命周期 | `log.info("syfb job")`                                                 |
| `WARN`  | 非预期但可恢复的情况、校验失败           | `log.warn("验证日期格式失败: {}，期望的格式是：yyyy-MM.", dateString)` |
| `ERROR` | 不可恢复的故障、非预期的异常             | 非预期错误的 catch 块                                                  |

### 本地开发

- 根日志级别：`debug`（在 `application-local.yaml` 中配置）
- UAT/生产环境：通常为 `info` 或 `warn`

---

## 结构化日志

### 应用日志（SLF4J + Logback）

```java
@Slf4j
public class DateTimeUtil {
    public static LocalDateTime parseMonth(String dateString) {
        try {
            // parsing logic
        } catch (Exception e) {
            log.warn("验证日期格式失败: {}，期望的格式是： yyyy-MM.", dateString);
            throw ServiceExceptionUtil.exception(ErrorCodeConstants.INVALID_DATE_FORMAT);
        }
    }
}
```

**约定：**
- 使用 `{}` 占位符，禁止字符串拼接
- 在日志消息中包含上下文数据（参数值、ID）
- 业务级日志消息使用中文（团队约定）

### API 访问日志（框架提供）

框架通过 `@ApiAccessLog` 自动记录 API 请求/响应：

```java
@GetMapping("/export-excel")
@ApiAccessLog(operateType = EXPORT)    // 将此记录为导出操作
public void exportXxxExcel(...) { ... }
```

### 操作审计日志（bizlog-sdk）

对于业务级审计追踪，使用 `@DiffLogField` 和 `LogRecordConstants`：

```java
// 在 VO 中——标记需要差异追踪的字段
@DiffLogField(name = "demo名称")
private String demoName;

// 在 LogRecordConstants 中——使用 SpEL 定义日志模板
String DEMO_CREATE = "'创建syfb_demo：' + #createReqVO.demoName";
```

---

## 应该记录的内容

- **定时任务执行**：记录任务的开始和完成（`log.info("syfb job")`）
- **数据导出操作**：使用 `@ApiAccessLog(operateType = EXPORT)` 进行追踪
- **业务状态变更**：对关键实体的 create/update/delete 使用操作审计日志
- **校验失败**：以 `warn` 级别记录，包含无效的输入值
- **外部服务调用**：记录请求/响应的摘要信息，便于集成调试

---

## 禁止记录的内容

- **数据库凭据**：绝不记录包含密码的连接字符串（检查 `application-local.yaml`——当前包含明文密码，仅限本地开发环境可接受）
- **用户令牌/会话 ID**：绝不记录认证令牌
- **大体积请求/响应体**：记录摘要信息，而非完整数据
- **个人身份信息（PII）**：避免在 info/debug 级别记录手机号、邮箱地址等个人数据
- **WARN/ERROR 级别的内部实现细节**：保持错误消息可操作，而非诊断信息转储

---

## 日志配置

### Logback Spring（`logback-spring.xml`）

- 本地开发使用控制台输出
- 滚动文件输出，按天轮转并 gzip 压缩
- 日志文件路径：`${user.home}/logs/`

### 环境级别配置

| 环境  | 根日志级别 | 说明            |
| ----- | ---------- | --------------- |
| local | `DEBUG`    | 完整 debug 输出 |
| uat   | `INFO`     | 标准运维日志    |
| prod  | `WARN`     | 最小化日志      |
