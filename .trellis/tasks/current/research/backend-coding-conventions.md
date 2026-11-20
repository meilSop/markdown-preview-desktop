# Research: syfb-backend Java 代码库编码规范与模式

- **Query**: 分析 syfb-backend Java 代码库的编码规范、架构模式和约定
- **Scope**: internal
- **Date**: 2026-09-01

---

## 1. 目录结构 (Directory Structure)

### Maven 多模块结构

```
syfb-backend/                          # 根项目 (pom, packaging=pom)
├── pom.xml                            # 父 POM，定义 dependencyManagement
├── sql/                               # 数据库初始化脚本
│   ├── 01-system.sql
│   ├── 02-quartz.sql
│   ├── 03-data.sql
│   ├── 04-system_user-data.sql
│   └── 05-update.sql
├── syfb-server/                       # 启动模块 (Spring Boot Application)
│   ├── pom.xml
│   └── src/main/
│       ├── java/com/sungrow/sgtp/server/SyfbApplication.java
│       └── resources/
│           ├── application.yaml       # 主配置
│           ├── application-local.yaml # 本地开发环境
│           ├── application-uat.yaml   # UAT 环境
│           └── application-prod.yaml  # 生产环境
└── syfb-module-portal/                # 业务模块 (pom, 聚合子模块)
    ├── pom.xml
    ├── syfb-module-portal-api/        # API 层：枚举、常量、对外接口定义
    │   └── src/main/java/com/sungrow/sgtp/module/portal/
    │       └── enums/
    │           ├── ErrorCodeConstants.java
    │           ├── DictTypeConstants.java
    │           └── LogRecordConstants.java
    └── syfb-module-portal-biz/        # 业务实现层
        └── src/main/java/com/sungrow/sgtp/module/portal/
            ├── controller/admin/      # Controller 层
            │   └── demo/
            │       ├── DemoController.java
            │       └── vo/            # VO 对象 (Request/Response)
            │           ├── DemoPageReqVO.java
            │           ├── DemoRespVO.java
            │           └── DemoSaveReqVO.java
            ├── service/               # Service 接口 + 实现
            │   └── demo/
            │       ├── DemoService.java
            │       └── impl/
            │           └── DemoServiceImpl.java
            ├── dal/                   # 数据访问层
            │   ├── dataobject/demo/
            │   │   └── DemoDO.java
            │   └── mysql/demo/
            │       └── DemoMapper.java
            ├── common/                # 公共 VO、常量、Excel 策略
            │   ├── BatchIdVO.java
            │   ├── BusinessConst.java
            │   ├── excel/
            │   └── vo/
            ├── job/                   # 定时任务
            │   └── SyfbJob.java
            └── util/                  # 工具类
                ├── DateTimeUtil.java
                └── ExcelExportUtil.java
```

### 包命名规范

| 层级         | 包路径模式                                       |
| ------------ | ------------------------------------------------ |
| 基础包       | `com.sungrow.sgtp.module.portal`                 |
| Controller   | `...controller.admin.{业务模块}`                 |
| VO           | `...controller.admin.{业务模块}.vo`              |
| Service 接口 | `...service.{业务模块}`                          |
| Service 实现 | `...service.{业务模块}.impl`                     |
| DO           | `...dal.dataobject.{业务模块}`                   |
| Mapper       | `...dal.mysql.{业务模块}`                        |
| 枚举 (API)   | `...enums` (在 api 模块)                         |
| 公共类       | `...common` / `...common.vo` / `...common.excel` |
| 工具类       | `...util`                                        |
| 定时任务     | `...job`                                         |

---

## 2. Controller 模式

**参考文件**: `syfb-module-portal-biz/.../controller/admin/demo/DemoController.java`

### 类级注解

```java
@Tag(name = "管理后台 - syfb_demo")        // OpenAPI 3 (Swagger) 分组
@RestController
@RequestMapping("/syfb/demo")              // URL 前缀: /syfb/{业务模块}
@Validated                                // 开启参数校验
```

### 依赖注入

```java
@Resource                                  // 使用 javax.annotation.Resource，非 @Autowired
private DemoService demoService;
```

### CRUD 端点模式

| 操作 | HTTP 方法 | URL             | 入参                                              | 返回类型                           |
| ---- | --------- | --------------- | ------------------------------------------------- | ---------------------------------- |
| 创建 | POST      | `/create`       | `@Validated(CREATE.class) @RequestBody SaveReqVO` | `CommonResult<Long>`               |
| 更新 | POST      | `/update`       | `@Validated(UPDATE.class) @RequestBody SaveReqVO` | `CommonResult<Boolean>`            |
| 删除 | POST      | `/delete`       | `@Valid @RequestBody DeleteByIdsVO`               | `CommonResult<Boolean>`            |
| 单查 | GET       | `/get`          | `@RequestParam("id") Long id`                     | `CommonResult<RespVO>`             |
| 分页 | POST      | `/page`         | `@Valid @RequestBody PageReqVO`                   | `CommonResult<PageResult<RespVO>>` |
| 导出 | GET       | `/export-excel` | `@Valid PageReqVO` + `HttpServletResponse`        | `void`                             |

### 响应包装

- 所有接口返回 `CommonResult<T>` 统一包装
- 使用静态导入 `import static com.sungrow.sgtp.framework.common.pojo.CommonResult.success;`
- 成功: `return success(data)`
- 更新/删除: `return success(true)`

### 权限控制

```java
// @PreAuthorize("@ss.hasPermission('dhr:demo:create')")  // 注释掉的权限模式
```

### API 文档

```java
@Operation(summary = "创建syfb_demo")
@Parameter(name = "id", description = "编号", required = true, example = "1024")
```

### VO 转换

- 使用 `BeanUtils.toBean(source, TargetClass.class)` 做 DO ↔ VO 转换
- Controller 层返回 RespVO，Service 层返回 DO

---

## 3. VO 模式

### 分页请求 VO (`DemoPageReqVO`)

```java
@Schema(description = "管理后台 - syfb_demo分页 Request VO")
@Data
@EqualsAndHashCode(callSuper = true)
@ToString(callSuper = true)
public class DemoPageReqVO extends PageParam {   // 继承框架分页基类
    @Schema(description = "demo_name", example = "赵六")
    private String demoName;

    @DateTimeFormat(pattern = FORMAT_YEAR_MONTH_DAY_HOUR_MINUTE_SECOND)
    private LocalDateTime[] createTime;           // 时间范围查询用数组
}
```

### 保存请求 VO (`DemoSaveReqVO`)

```java
@Schema(description = "管理后台 - syfb_demo新增/修改 Request VO")
@Data
public class DemoSaveReqVO {
    @NotNull(message = "主键id不能为空", groups = {ValidatedGroup.UPDATE.class})
    @Null(message = "主键id需为空", groups = {ValidatedGroup.CREATE.class})
    private Long id;

    @NotEmpty(message = "demo_name不能为空")
    @DiffLogField(name="demo名称")               // 操作日志差异字段
    private String demoName;
}
```

- 使用 `ValidatedGroup.CREATE` / `ValidatedGroup.UPDATE` 分组校验
- `@DiffLogField` 用于操作日志的字段差异对比

### 响应 VO (`DemoRespVO`)

```java
@Schema(description = "管理后台 - syfb_demo Response VO")
@Data
@ExcelIgnoreUnannotated                          // Excel 导出忽略未注解字段
public class DemoRespVO {
    @Schema(description = "主键", requiredMode = Schema.RequiredMode.REQUIRED, example = "4271")
    @ExcelProperty("主键")                        // EasyExcel 导出列名
    private Long id;
}
```

### VO 命名约定

| 类型           | 命名模式      | 用途             |
| -------------- | ------------- | ---------------- |
| `XxxSaveReqVO` | 创建/更新请求 | 新增和修改共用   |
| `XxxPageReqVO` | 分页查询请求  | 继承 `PageParam` |
| `XxxRespVO`    | 响应          | 返回给前端       |

---

## 4. Service 模式

### 接口定义 (`DemoService`)

```java
public interface DemoService {
    Long createDemo(@Valid DemoSaveReqVO createReqVO);
    void updateDemo(@Valid DemoSaveReqVO updateReqVO);
    void deleteDemo(List<Long> ids);
    DemoDO getDemo(Long id);
    PageResult<DemoDO> getDemoPage(DemoPageReqVO pageReqVO);
}
```

- 接口方法参数使用 VO 类型（创建/更新），查询返回 DO 类型
- 方法使用 Javadoc 注释

### 实现类 (`DemoServiceImpl`)

```java
@Service
@Validated                                    // 开启参数校验
public class DemoServiceImpl implements DemoService {

    @Resource
    private DemoMapper demoMapper;             // 注入 Mapper

    @Override
    public Long createDemo(DemoSaveReqVO createReqVO) {
        DemoDO demo = BeanUtils.toBean(createReqVO, DemoDO.class);  // VO → DO
        demoMapper.insert(demo);
        return demo.getId();
    }

    @Override
    public void updateDemo(DemoSaveReqVO updateReqVO) {
        validateDemoExists(updateReqVO.getId());  // 先校验存在
        DemoDO updateObj = BeanUtils.toBean(updateReqVO, DemoDO.class);
        demoMapper.updateById(updateObj);
    }

    private void validateDemoExists(Long id) {
        if (demoMapper.selectById(id) == null) {
            throw ServiceExceptionUtil.exception(ErrorCodeConstants.DEMO_NOT_EXISTS);
        }
    }
}
```

**关键模式**:
- DI: `@Resource`（非 `@Autowired`）
- 更新前先校验实体存在
- 异常抛出: `ServiceExceptionUtil.exception(ErrorCodeConstants.XXX)`
- VO ↔ DO 转换: `BeanUtils.toBean()`
- CRUD 命名: `createXxx`, `updateXxx`, `deleteXxx`, `getXxx`, `getXxxPage`

---

## 5. DAL / 数据访问模式

### Data Object (DO)

```java
@TableName("syfb_demo")                         // MyBatis-Plus 表名映射
@KeySequence("syfb_demo_seq")                   // Oracle/PostgreSQL 序列
@Data
@EqualsAndHashCode(callSuper = true)
@ToString(callSuper = true)
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DemoDO extends BaseDO {            // 继承框架基类（含 createTime, updateTime, creator, updater, deleted, tenantId）

    @TableId                                    // 主键标识
    private Long id;
    private String demoName;
    private String creatorName;
}
```

- DO 命名: `{业务名}DO`
- 表名前缀: `syfb_` (业务表)
- 继承 `BaseDO` (含通用审计字段)
- 主键策略: `@TableId` + 雪花算法 (`ASSIGN_ID`)
- Lombok 全家桶: `@Data @Builder @NoArgsConstructor @AllArgsConstructor`

### Mapper

```java
@Mapper
public interface DemoMapper extends BaseMapperX<DemoDO> {   // 继承增强 BaseMapper

    default PageResult<DemoDO> selectPage(DemoPageReqVO reqVO) {
        return selectPage(reqVO, new LambdaQueryWrapperX<DemoDO>()
                .likeIfPresent(DemoDO::getDemoName, reqVO.getDemoName())       // 条件非空时加 LIKE
                .likeIfPresent(DemoDO::getCreatorName, reqVO.getCreatorName())
                .betweenIfPresent(DemoDO::getCreateTime, reqVO.getCreateTime()) // 范围查询
                .orderByDesc(DemoDO::getId));
    }
}
```

**关键模式**:
- 继承 `BaseMapperX<T>` (框架增强的 BaseMapper)
- 使用 `LambdaQueryWrapperX` (框架增强的查询构造器)
- `xxxIfPresent()`: 参数非空时才加条件
- 分页查询使用 `selectPage(reqVO, wrapper)` 返回 `PageResult<DO>`
- Mapper 方法用 `default` 方法实现，无需 XML
- 命名: `selectPage`, `selectById`, `insert`, `updateById`, `deleteBatchIds`

### MyBatis-Plus 配置

```yaml
mybatis-plus:
  configuration:
    map-underscore-to-camel-case: true
  global-config:
    db-config:
      id-type: ASSIGN_ID          # 雪花算法
      logic-delete-value: 1
      logic-not-delete-value: 0
  type-aliases-package: ${sgtp.info.base-package}.module.*.dal.dataobject

mybatis-plus-join:
  table-alias: t                  # 默认表别名
  sub-table-logic: true           # 副表逻辑删除
```

---

## 6. 错误处理模式

### 错误码枚举 (`ErrorCodeConstants`)

```java
public interface ErrorCodeConstants extends GlobalErrorCodeConstants {

    // 按业务模块分段编号
    // ========== 合同管理 1-020-000-000 ==========
    ErrorCode CONTRACT_NOT_EXISTS = new ErrorCode(1_020_000_000, "合同不存在");

    // ========== 线索管理 1-020-001-000 ==========
    ErrorCode CLUE_NOT_EXISTS = new ErrorCode(1_020_001_000, "线索不存在");

    // ========== syfb_demo 1_020_100_001 ==========
    ErrorCode DEMO_NOT_EXISTS = new ErrorCode(1_020_100_001, "syfb_demo不存在");
}
```

**错误码分段规则**: `1-0XX-YYY-ZZZ`
- `1` = 固定前缀
- `020` = 模块编号 (portal 模块)
- `000/001/002` = 子模块 (合同/线索/商机)
- `000-001` = 具体错误序号

### 异常抛出方式

```java
// 在 Service 中抛出业务异常
throw ServiceExceptionUtil.exception(ErrorCodeConstants.DEMO_NOT_EXISTS);
```

- 框架提供 `GlobalExceptionHandler` 统一捕获并包装为 `CommonResult`
- 使用 `ErrorCode` 对象（code + message）

---

## 7. 日志模式

### 日志框架

- 使用 Lombok `@Slf4j` 注解 (SLF4J → Logback)
- 日志文件路径: `${user.home}/logs/${spring.application.name}.log`
- 本地开发日志级别: `root: debug`

### 日志使用示例

```java
@Slf4j
public class DateTimeUtil {
    // warn 级别带中文提示
    log.warn("验证日期格式失败: {}，期望的格式是： yyyy-MM.", dateString);
}

@Slf4j
public class SyfbJob {
    log.info("syfb job");
}
```

### 操作日志

- 使用 `@DiffLogField` 注解标记需要记录差异的字段
- `LogRecordConstants` 定义操作日志模板（使用 SpEL 表达式）
- 日志记录框架: `com.mzt.logapi` (bizlog-sdk)

---

## 8. 通用注解和工具类

### 框架核心注解

| 注解                                  | 来源                               | 用途                 |
| ------------------------------------- | ---------------------------------- | -------------------- |
| `@ApiAccessLog(operateType = EXPORT)` | `sgtp.framework.apilog`            | API 访问日志记录     |
| `@DiffLogField(name="xxx")`           | `com.mzt.logapi`                   | 操作日志字段差异对比 |
| `@TenantJob`                          | `sgtp.framework.tenant`            | 多租户定时任务标记   |
| `@ValidatedGroup.CREATE/UPDATE`       | `sgtp.framework.common.validation` | 校验分组             |

### 框架核心工具类

| 类                                          | 用途             |
| ------------------------------------------- | ---------------- |
| `BeanUtils.toBean(source, target)`          | 对象属性拷贝     |
| `ServiceExceptionUtil.exception(errorCode)` | 抛出业务异常     |
| `ExcelUtils.write(...)`                     | Excel 导出       |
| `LambdaQueryWrapperX`                       | 增强型查询构造器 |

### 自定义工具类

| 类                               | 用途                                       |
| -------------------------------- | ------------------------------------------ |
| `DateTimeUtil`                   | 日期时间处理（月份首尾、格式化、周期计算） |
| `ExcelExportUtil`                | EasyExcel 导出封装                         |
| `AutoWrapStyleStrategy`          | Excel 自动换行样式策略                     |
| `LocalDateTimeToStringConverter` | LocalDateTime → String Excel 转换器        |

### 公共 VO

| 类               | 用途                     |
| ---------------- | ------------------------ |
| `BatchIdVO`      | 批量操作 ID 列表         |
| `DeleteByIdsVO`  | 框架提供的批量删除 ID VO |
| `ChartData<T>`   | 图表数据 (xAxis + data)  |
| `NameValue<K,V>` | 通用名值对               |
| `BusinessConst`  | 业务常量 (YesNo 等)      |

---

## 9. 配置模式

### Spring Boot 配置

- 主配置: `application.yaml` → 通用配置（MyBatis-Plus, Swagger, 多租户, WebSocket 等）
- Profile 配置: `application-{local|uat|prod}.yaml` → 环境特定配置
- 默认激活: `spring.profiles.active: uat`
- 配置导入链: `application.yaml` → `application-${profile}.yaml` → Nacos 远程配置

### 自定义配置命名空间

```yaml
sgtp:
  info:
    version: 1.0.0
    base-package: com.sungrow.sgtp
  web: ...
  security: ...
  websocket: ...
  swagger: ...
  captcha: ...
  tenant: ...
```

### 外部集成

- **Nacos**: 配置中心 + 注册中心 (UAT/PROD)
- **Redis**: 缓存 + 验证码存储 + 分布式锁
- **Druid**: 数据库连接池 + 监控
- **MySQL**: 主数据库 (动态多数据源)
- **Quartz**: 定时任务调度 (JDBC 存储, 集群模式)
- **SSO (iPaaS)**: 阳光电源统一认证
- **钉钉**: 消息通知集成
- **Knife4j / SpringDoc**: API 文档
- **EasyExcel**: Excel 导入导出
- **Lock4j + Redisson**: 分布式锁

### 多租户

- 启用: `sgtp.tenant.enable: true`
- 配置忽略 URL 和忽略表
- 定时任务使用 `@TenantJob` 自动多租户执行

---

## 10. 命名约定

### 类命名

| 类型         | 模式                       | 示例                                      |
| ------------ | -------------------------- | ----------------------------------------- |
| Controller   | `{Xxx}Controller`          | `DemoController`                          |
| Service 接口 | `{Xxx}Service`             | `DemoService`                             |
| Service 实现 | `{Xxx}ServiceImpl`         | `DemoServiceImpl`                         |
| Mapper       | `{Xxx}Mapper`              | `DemoMapper`                              |
| Data Object  | `{Xxx}DO`                  | `DemoDO`                                  |
| 分页请求 VO  | `{Xxx}PageReqVO`           | `DemoPageReqVO`                           |
| 保存请求 VO  | `{Xxx}SaveReqVO`           | `DemoSaveReqVO`                           |
| 响应 VO      | `{Xxx}RespVO`              | `DemoRespVO`                              |
| 枚举常量     | `{Xxx}Constants`           | `ErrorCodeConstants`, `DictTypeConstants` |
| 工具类       | `{Xxx}Util` / `{Xxx}Utils` | `DateTimeUtil`, `ExcelExportUtil`         |
| 定时任务     | `{Xxx}Job`                 | `SyfbJob`                                 |

### 方法命名

| 操作 | Controller       | Service      | Mapper           |
| ---- | ---------------- | ------------ | ---------------- |
| 创建 | `createXxx`      | `createXxx`  | `insert`         |
| 更新 | `updateXxx`      | `updateXxx`  | `updateById`     |
| 删除 | `deleteXxx`      | `deleteXxx`  | `deleteBatchIds` |
| 单查 | `getXxx`         | `getXxx`     | `selectById`     |
| 分页 | `getXxxPage`     | `getXxxPage` | `selectPage`     |
| 导出 | `exportXxxExcel` | —            | —                |

### URL 命名

- 前缀: `/syfb/{业务模块}` (如 `/syfb/demo`)
- CRUD: `/create`, `/update`, `/delete`, `/get`, `/page`, `/export-excel`

### 变量命名

- 请求 VO 变量: `createReqVO`, `updateReqVO`, `pageReqVO`, `deleteReqVO`
- DO 变量: 与实体同名小写 (`demo`, `updateObj`)
- 校验方法: `validate{Xxx}Exists`

---

## 11. 构建配置

### Maven 结构

- **Java 版本**: 8 (source + target)
- **Spring Boot**: 2.7.18
- **基础框架**: `sgtp-dependencies` 2.1.5 (BOM, 基于芋道 ruoyi-vue-pro)
- **打包**: `spring-boot-maven-plugin` repackage

### 核心依赖

| 依赖                                           | 用途                                              |
| ---------------------------------------------- | ------------------------------------------------- |
| `sgtp-common`                                  | 通用工具 (CommonResult, BeanUtils, PageResult 等) |
| `sgtp-spring-boot-starter-mybatis`             | MyBatis-Plus 封装                                 |
| `sgtp-spring-boot-starter-security`            | 安全认证                                          |
| `sgtp-spring-boot-starter-redis`               | Redis 封装                                        |
| `sgtp-spring-boot-starter-excel`               | EasyExcel 封装                                    |
| `sgtp-spring-boot-starter-mq`                  | 消息队列                                          |
| `sgtp-spring-boot-starter-protection`          | 服务保障 (限流/幂等/分布式锁)                     |
| `sgtp-spring-boot-starter-biz-tenant`          | 多租户                                            |
| `sgtp-spring-boot-starter-sso-data-permission` | SSO 数据权限                                      |
| `sgtp-module-system-api/biz`                   | 系统管理模块                                      |
| `sgtp-module-infra-api/biz`                    | 基础设施模块                                      |
| `lock4j-redisson-spring-boot-starter`          | 分布式锁                                          |
| `spring-cloud-starter-alibaba-nacos-config`    | Nacos 配置中心                                    |
| `spring-boot-starter-validation`               | 参数校验                                          |

### 私有仓库

```xml
<repository>
    <id>ctp-maven</id>
    <url>http://10.63.32.20:8081/repository/CTP-Maven-Group/</url>
</repository>
```

---

## Caveats / 注意事项

1. **框架依赖不可见**: `sgtp-*` 系列是内部私有框架 (基于 ruoyi-vue-pro/芋道)，源码不在本仓库中。`CommonResult`, `BaseDO`, `BaseMapperX`, `LambdaQueryWrapperX`, `BeanUtils`, `ServiceExceptionUtil`, `PageParam`, `PageResult`, `DeleteByIdsVO`, `ValidatedGroup`, `GlobalErrorCodeConstants` 等均来自框架。
2. **测试包名不一致**: 测试类包名为 `com.sungrow.sgpt.qms`（注意是 `sgpt` 而非 `sgtp`），疑似从 QMS 项目复制而来，与主包名 `com.sungrow.sgtp` 不一致。
3. **Controller 权限注解被注释**: Demo Controller 中 `@PreAuthorize` 全部被注释掉，实际权限策略不明确。
4. **application-local.yaml 含明文密码**: 数据库和 Redis 密码明文存储，仅用于本地开发。
5. **循环依赖**: 配置显式允许循环引用 (`allow-circular-references: true`)，注释说明"三层架构无法避免"。
6. **业务表前缀**: 业务表使用 `syfb_` 前缀。
7. **API 模块 vs BIZ 模块分离**: 枚举/常量放在 api 模块，可被其他模块依赖；业务实现放在 biz 模块。

