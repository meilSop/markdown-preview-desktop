# 后端项目结构与数据库约定

## 项目目录结构

```
syfb-backend/
├── pom.xml                                    # 父 POM（packaging=pom）
├── sql/                                       # 数据库脚本
│   ├── 01-system.sql                          # 系统表
│   ├── 02-quartz.sql                          # Quartz 表
│   ├── 03-data.sql                            # 初始数据
│   ├── 04-system_user-data.sql                # 系统用户数据
│   └── 05-update.sql                          # 增量更新脚本
├── syfb-server/                               # 启动模块
│   ├── pom.xml
│   └── src/main/
│       ├── java/.../server/SyfbApplication.java
│       └── resources/
│           ├── application.yaml               # 主配置
│           ├── application-local.yaml         # 本地开发
│           ├── application-uat.yaml           # UAT 环境
│           ├── application-prod.yaml          # 生产环境
│           └── logback-spring.xml             # 日志配置
└── syfb-module-portal/                        # 业务模块（聚合器）
    ├── pom.xml
    ├── syfb-module-portal-api/                # API 层
    │   ├── pom.xml
    │   └── src/main/java/.../portal/
    │       └── enums/
    │           ├── ErrorCodeConstants.java    # 错误码
    │           ├── DictTypeConstants.java     # 字典类型
    │           └── LogRecordConstants.java    # 操作日志
    └── syfb-module-portal-biz/                # 业务实现
        ├── pom.xml
        └── src/main/java/.../portal/
            ├── controller/admin/{module}/     # REST 控制器
            │   ├── {Xxx}Controller.java
            │   └── vo/
            │       ├── {Xxx}SaveReqVO.java
            │       ├── {Xxx}PageReqVO.java
            │       └── {Xxx}RespVO.java
            ├── service/{module}/              # 服务层
            │   ├── {Xxx}Service.java
            │   └── impl/{Xxx}ServiceImpl.java
            ├── dal/                           # 数据访问层
            │   ├── dataobject/{module}/
            │   │   └── {Xxx}DO.java
            │   └── mysql/{module}/
            │       └── {Xxx}Mapper.java
            ├── common/                        # 公共类
            │   ├── BatchIdVO.java
            │   ├── BusinessConst.java
            │   ├── excel/
            │   └── vo/
            ├── job/                           # 定时任务
            │   └── {Xxx}Job.java
            └── util/                          # 工具类
                ├── DateTimeUtil.java
                └── ExcelExportUtil.java
```

## 包路径基础

```
com.sungrow.sgtp.module.portal
├── controller.admin.{module}        # 控制器
├── controller.admin.{module}.vo     # 请求/响应 VO
├── service.{module}                 # 服务接口
├── service.{module}.impl            # 服务实现
├── dal.dataobject.{module}          # 数据对象
├── dal.mysql.{module}               # Mapper
├── enums                            # 枚举（api 模块）
├── common                           # 公共类
├── job                              # 定时任务
└── util                             # 工具类
```

---

## 数据库约定

### 建表模板

```sql
CREATE TABLE `syfb_xxx` (
    `id`            bigint       NOT NULL AUTO_INCREMENT COMMENT '主键',
    `name`          varchar(128) NOT NULL DEFAULT '' COMMENT '名称',
    `status`        tinyint      NOT NULL DEFAULT 0 COMMENT '状态',
    `creator`       varchar(64)  DEFAULT '' COMMENT '创建者',
    `create_time`   datetime     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `updater`       varchar(64)  DEFAULT '' COMMENT '更新者',
    `update_time`   datetime     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    `deleted`       bit(1)       NOT NULL DEFAULT b'0' COMMENT '是否删除',
    `tenant_id`     bigint       NOT NULL DEFAULT 0 COMMENT '租户编号',
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='xxx表';
```

### 表命名规则

| 约定     | 规则                                               |
| -------- | -------------------------------------------------- |
| 表名前缀 | `syfb_`（业务表）                                  |
| 表名格式 | `syfb_` + 蛇形命名（如 `syfb_demo`）               |
| 主键     | `id`，BIGINT，自增/雪花算法                        |
| 审计字段 | `creator`, `create_time`, `updater`, `update_time` |
| 逻辑删除 | `deleted`，bit(1)，0=未删除，1=已删除              |
| 多租户   | `tenant_id`，BIGINT                                |
| 字符集   | `utf8mb4`                                          |
| 引擎     | `InnoDB`                                           |

### 列命名规则

- 蛇形命名（snake_case）
- MyBatis-Plus 自动映射为 Java 驼峰命名
- 时间字段统一使用 `datetime` 类型
- 布尔字段使用 `bit(1)` 类型
- 状态字段使用 `tinyint` 类型

---

## SQL 脚本约定

- 存放位置：`syfb-backend/sql/`
- 命名格式：`{NN}-{description}.sql`
- 增量更新：追加到 `05-update.sql` 或创建新文件
- 脚本通过 CI/CD 或手动执行
- 当前未使用 Flyway/Liquibase

---

## 新增模块检查清单

创建新的业务模块时，确保完成以下步骤：

1. **数据库** — 创建 `syfb_xxx` 表（含标准审计字段）
2. **错误码** — 在 `ErrorCodeConstants` 分配错误码段
3. **DO** — 创建数据对象，继承 `BaseDO`
4. **Mapper** — 创建 Mapper 接口，继承 `BaseMapperX`
5. **VO** — 创建 SaveReqVO / PageReqVO / RespVO
6. **Service** — 创建服务接口和实现
7. **Controller** — 创建 REST 控制器
8. **权限** — 配置菜单权限标识
9. **SQL** — 将建表语句追加到 `sql/` 目录
