# 目录结构

> 本项目后端代码的组织方式。

---

## 概述

后端采用基于 Spring Boot 2.7.18 和内部 `sgtp` 框架（源自 ruoyi-vue-pro）的 **Maven 多模块**架构。每个业务领域被拆分为一个 **api** 模块（枚举、常量、对外接口）和一个 **biz** 模块（控制器、服务、数据访问层实现）。

---

## 目录布局

```
syfb-backend/                              # 根项目（pom，packaging=pom）
├── pom.xml                                # 父 POM，dependencyManagement
├── sql/                                   # 数据库初始化脚本
│   ├── 01-system.sql
│   ├── 02-quartz.sql
│   ├── 03-data.sql
│   ├── 04-system_user-data.sql
│   └── 05-update.sql
├── syfb-server/                           # 启动模块（Spring Boot Application）
│   └── src/main/
│       ├── java/.../server/SyfbApplication.java
│       └── resources/
│           ├── application.yaml           # 主配置文件
│           ├── application-local.yaml     # 本地开发
│           ├── application-uat.yaml       # UAT 环境
│           └── application-prod.yaml      # 生产环境
└── syfb-module-portal/                    # 业务模块（pom，聚合器）
    ├── syfb-module-portal-api/            # API 层：枚举、常量、对外接口
    │   └── src/main/java/.../portal/
    │       └── enums/
    │           ├── ErrorCodeConstants.java
    │           ├── DictTypeConstants.java
    │           └── LogRecordConstants.java
    └── syfb-module-portal-biz/            # 业务实现
        └── src/main/java/.../portal/
            ├── controller/admin/          # REST 控制器
            │   └── {module}/
            │       ├── {Xxx}Controller.java
            │       └── vo/               # 请求/响应 VO
            │           ├── {Xxx}SaveReqVO.java
            │           ├── {Xxx}PageReqVO.java
            │           └── {Xxx}RespVO.java
            ├── service/                   # 服务接口 + 实现
            │   └── {module}/
            │       ├── {Xxx}Service.java
            │       └── impl/
            │           └── {Xxx}ServiceImpl.java
            ├── dal/                       # 数据访问层
            │   ├── dataobject/{module}/
            │   │   └── {Xxx}DO.java
            │   └── mysql/{module}/
            │       └── {Xxx}Mapper.java
            ├── common/                    # 公共 VO、常量、Excel 策略
            │   ├── BatchIdVO.java
            │   ├── BusinessConst.java
            │   ├── excel/
            │   └── vo/
            ├── job/                       # 定时任务
            │   └── {Xxx}Job.java
            └── util/                      # 工具类
                ├── DateTimeUtil.java
                └── ExcelExportUtil.java
```

---

## 包命名规范

| 层级             | 包模式                                           |
| ---------------- | ------------------------------------------------ |
| 基础包           | `com.sungrow.sgtp.module.portal`                 |
| 控制器           | `...controller.admin.{module}`                   |
| VO               | `...controller.admin.{module}.vo`                |
| 服务接口         | `...service.{module}`                            |
| 服务实现         | `...service.{module}.impl`                       |
| 数据对象         | `...dal.dataobject.{module}`                     |
| Mapper           | `...dal.mysql.{module}`                          |
| 枚举（API 模块） | `...enums`（在 api 子模块中）                    |
| 公共类           | `...common` / `...common.vo` / `...common.excel` |
| 工具类           | `...util`                                        |
| 定时任务         | `...job`                                         |

---

## 模块组织

### 新增业务模块

1. 在根目录下创建新的 `syfb-module-{name}/` 目录，遵循 api/biz 拆分模式
2. 或者，对于较简单的功能，在现有的 `syfb-module-portal-biz` 下添加新的子包
3. 将枚举/常量放在 `-api` 模块中，以便其他模块依赖
4. 将所有业务逻辑（controller、service、dal）放在 `-biz` 模块中

### 新增 CRUD 功能

遵循 `controller/admin/{module}/` 下已有的标准模式：

1. 创建 `{Xxx}Controller.java`，包含标准 CRUD 接口
2. 创建 VO 类：`{Xxx}SaveReqVO`、`{Xxx}PageReqVO`、`{Xxx}RespVO`
3. 创建 `{Xxx}Service.java` 接口和 `{Xxx}ServiceImpl.java` 实现
4. 创建 `{Xxx}DO.java` 数据对象
5. 创建 `{Xxx}Mapper.java` 数据访问接口

---

## 类命名规范

| 类型        | 命名模式                   | 示例                 |
| ----------- | -------------------------- | -------------------- |
| 控制器      | `{Xxx}Controller`          | `DemoController`     |
| 服务接口    | `{Xxx}Service`             | `DemoService`        |
| 服务实现    | `{Xxx}ServiceImpl`         | `DemoServiceImpl`    |
| Mapper      | `{Xxx}Mapper`              | `DemoMapper`         |
| 数据对象    | `{Xxx}DO`                  | `DemoDO`             |
| 分页请求 VO | `{Xxx}PageReqVO`           | `DemoPageReqVO`      |
| 保存请求 VO | `{Xxx}SaveReqVO`           | `DemoSaveReqVO`      |
| 响应 VO     | `{Xxx}RespVO`              | `DemoRespVO`         |
| 常量        | `{Xxx}Constants`           | `ErrorCodeConstants` |
| 工具类      | `{Xxx}Util` / `{Xxx}Utils` | `DateTimeUtil`       |
| 定时任务    | `{Xxx}Job`                 | `SyfbJob`            |

---

## 示例

`syfb-module-portal-biz` 下的 `demo` 模块是参考实现：

- 控制器：`controller/admin/demo/DemoController.java`
- VO：`controller/admin/demo/vo/DemoSaveReqVO.java`、`DemoPageReqVO.java`、`DemoRespVO.java`
- 服务：`service/demo/DemoService.java` + `service/demo/impl/DemoServiceImpl.java`
- 数据对象：`dal/dataobject/demo/DemoDO.java`
- Mapper：`dal/mysql/demo/DemoMapper.java`
