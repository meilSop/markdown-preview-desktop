---
name: backend-create
description: "创建后端 Java 代码模块。基于项目架构规范和代码模式，生成 Spring Boot Controller、Service、Mapper、DO、VO 等后端代码。适用于需要新建后端业务模块、CRUD 功能、定时任务、错误码定义等场景。"
---

# 后端代码创建

按照项目架构约定和现有代码模式，创建高质量的后端 Java 代码。

---

## 前置检查

在创建任何代码之前，确认：

1. **目标明确** — 知道要创建什么后端模块/功能
2. **规范已加载** — 阅读 `.qoder/agents/backend-creator.md` 中的代码模板
3. **参考已就位** — 找到类似的现有模块作为参考（推荐参考 `demo` 模块）

```bash
# 查看现有业务模块
ls syfb-backend/syfb-module-portal/syfb-module-portal-biz/src/main/java/com/sungrow/sgtp/module/portal/controller/admin/

# 查看现有服务
ls syfb-backend/syfb-module-portal/syfb-module-portal-biz/src/main/java/com/sungrow/sgtp/module/portal/service/

# 查看现有数据对象
ls syfb-backend/syfb-module-portal/syfb-module-portal-biz/src/main/java/com/sungrow/sgtp/module/portal/dal/dataobject/
```

---

## 创建类型与对应文件

### 类型 A：完整 CRUD 模块

创建包含 Controller、Service、Mapper、DO、VO 的完整模块。

**文件清单**:
```
syfb-module-portal-api/
└── src/main/java/.../portal/enums/
    └── ErrorCodeConstants.java          # 追加错误码

syfb-module-portal-biz/
└── src/main/java/.../portal/
    ├── controller/admin/{module}/
    │   ├── {Xxx}Controller.java         # REST 接口
    │   └── vo/
    │       ├── {Xxx}SaveReqVO.java      # 保存请求 VO
    │       ├── {Xxx}PageReqVO.java      # 分页请求 VO
    │       └── {Xxx}RespVO.java         # 响应 VO
    ├── service/{module}/
    │   ├── {Xxx}Service.java            # 服务接口
    │   └── impl/{Xxx}ServiceImpl.java   # 服务实现
    ├── dal/
    │   ├── dataobject/{module}/{Xxx}DO.java   # 数据对象
    │   └── mysql/{module}/{Xxx}Mapper.java    # Mapper
    └── job/{Xxx}Job.java                # 定时任务（可选）
```

### 类型 B：单层级代码

- **仅 Controller + VO** — 新增 API 接口
- **仅 Service + ServiceImpl** — 新增业务逻辑
- **仅 DO + Mapper** — 新增数据表映射

### 类型 C：枚举/常量

- **ErrorCodeConstants** — 追加错误码
- **DictTypeConstants** — 追加字典类型
- **LogRecordConstants** — 追加操作日志模板

---

## 编码规范速查

### 依赖注入

| 规则     | 值                               |
| -------- | -------------------------------- |
| 注入注解 | `@Resource`（禁止 `@Autowired`） |
| 注入方式 | 字段注入（禁止构造器注入）       |

### 注解规范

| 层级       | 必须注解                                                                                |
| ---------- | --------------------------------------------------------------------------------------- |
| Controller | `@Tag`, `@RestController`, `@RequestMapping`, `@Validated`, `@Operation`, `@Parameter`  |
| Service    | `@Service`, `@Validated`                                                                |
| DO         | `@TableName`, `@KeySequence`, `@Data`, `@EqualsAndHashCode(callSuper=true)`, `@Builder` |
| Mapper     | `@Mapper`                                                                               |
| VO         | `@Schema`, `@Data`, `@ExcelIgnoreUnannotated`(RespVO)                                   |

### 返回值约定

| 场景       | 返回类型                              |
| ---------- | ------------------------------------- |
| 创建       | `CommonResult<Long>`                  |
| 更新/删除  | `CommonResult<Boolean>`               |
| 获取单条   | `CommonResult<XxxRespVO>`             |
| 获取分页   | `CommonResult<PageResult<XxxRespVO>>` |
| 导出 Excel | `void`（直接写 response）             |

### 对象转换

- 统一使用 `BeanUtils.toBean(source, TargetClass.class)`
- 禁止手动逐字段复制

### 异常处理

- 在 Service 层抛出，使用 `ServiceExceptionUtil.exception(ErrorCodeConstants.XXX)`
- 禁止在 Controller 中 try-catch
- 禁止使用 `throw new RuntimeException(...)`

### 错误码格式

```
1-0XX-YYY-ZZZ
│  │    │   └── 错误序号
│  │    └────── 子模块/实体编号
│  └─────────── 模块编号（020 = portal）
└────────────── 固定前缀
```

---

## 关键导入

### sgtp 框架核心类

```java
// 统一返回
import com.sungrow.sgtp.framework.common.pojo.CommonResult;
import static com.sungrow.sgtp.framework.common.pojo.CommonResult.success;

// 分页
import com.sungrow.sgtp.framework.common.pojo.PageParam;
import com.sungrow.sgtp.framework.common.pojo.PageResult;
import com.sungrow.sgtp.framework.common.pojo.DeleteByIdsVO;

// 校验
import com.sungrow.sgtp.framework.common.validation.ValidatedGroup;

// 对象转换
import com.sungrow.sgtp.framework.common.util.object.BeanUtils;

// 异常
import com.sungrow.sgtp.framework.common.exception.util.ServiceExceptionUtil;

// MyBatis-Plus
import com.sungrow.sgtp.framework.mybatis.core.dataobject.BaseDO;
import com.sungrow.sgtp.framework.mybatis.core.mapper.BaseMapperX;
import com.sungrow.sgtp.framework.mybatis.core.query.LambdaQueryWrapperX;

// Excel
import com.sungrow.sgtp.framework.excel.core.util.ExcelUtils;

// 日志
import com.sungrow.sgtp.framework.apilog.core.annotation.ApiAccessLog;
import static com.sungrow.sgtp.framework.apilog.core.enums.OperateTypeEnum.EXPORT;

// Swagger
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import io.swagger.v3.oas.annotations.media.Schema;

// Lombok
import lombok.*;

// 校验
import javax.validation.Valid;
import javax.validation.constraints.*;
import javax.annotation.Resource;

// 定时任务
import com.sungrow.sgtp.framework.quartz.core.handler.JobHandler;
import com.sungrow.sgtp.framework.tenant.core.job.TenantJob;
```

---

## 创建顺序

按以下顺序创建文件，确保依赖关系正确：

1. **ErrorCode**（api 模块） → 定义错误码常量
2. **DO**（dal/dataobject） → 定义数据模型
3. **Mapper**（dal/mysql） → 定义数据访问
4. **VO**（controller/admin/vo） → 定义请求/响应对象
5. **Service 接口**（service） → 定义业务方法
6. **ServiceImpl**（service/impl） → 实现业务逻辑
7. **Controller**（controller/admin） → 定义 REST 接口

---

## 验证清单

创建完成后，逐项检查：

### 架构合规
- [ ] Controller 无业务逻辑，仅委托 Service
- [ ] Controller 不直接访问 Mapper
- [ ] Service 方法与 HTTP 无关
- [ ] 异常在 Service 层抛出，不在 Controller 中捕获

### 注解完整
- [ ] `@Tag` + `@Operation` + `@Parameter` / `@Schema` 齐全
- [ ] `@Resource` 而非 `@Autowired`
- [ ] DO 有 `@TableName` + `@KeySequence` + 继承 `BaseDO`
- [ ] Mapper 有 `@Mapper` + 继承 `BaseMapperX`

### 代码质量
- [ ] update/delete 有存在性校验（`validateXxxExists`）
- [ ] 对象转换使用 `BeanUtils.toBean()`
- [ ] 查询使用 `LambdaQueryWrapperX` + `xxxIfPresent()`
- [ ] 分页默认 `orderByDesc(XxxDO::getId)`
- [ ] 错误码遵循 `1-0XX-YYY-ZZZ` 分段

### 命名正确
- [ ] 表名 `syfb_` 前缀 + 蛇形命名
- [ ] 类名遵循约定（XxxController, XxxService, XxxServiceImpl 等）
- [ ] 包名遵循层级结构
- [ ] 方法名遵循 CRUD 命名（createXxx, updateXxx, deleteXxx, getXxx, getXxxPage）

---

## 后续步骤

根据创建的模块类型：

1. **新建模块** → 创建数据库表 `syfb_xxx`（含标准审计字段）
2. **新建模块** → 在 `ErrorCodeConstants` 分配错误码段
3. **新建模块** → 配置菜单权限（`dhr:xxx:create/update/delete/query/export`）
4. **API 变更** → 通知前端开发者接口变更
5. **定时任务** → 在管理后台配置 Quartz 任务调度

---

## 约束与限制

- **Java 8** — 不使用 Java 9+ 特性
- **Spring Boot 2.7.18** — 遵循 javax 包（非 jakarta）
- **sgtp 2.1.5** — 核心类来自框架，不要重复实现
- **MySQL 为主** — 但保留 Oracle/PostgreSQL 兼容（`@KeySequence`）
- **多租户** — 框架级别已启用，DO 继承 BaseDO 自动获得 tenantId
- **逻辑删除** — 已启用，deleted 列由 BaseDO 管理
