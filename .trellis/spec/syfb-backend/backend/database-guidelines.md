# 数据库规范

> 本项目的数据库模式与约定。

---

## 概述

项目使用 **MySQL** 作为主数据库，**MyBatis-Plus** 作为 ORM 层。内部 `sgtp` 框架提供了增强的基类（`BaseDO`、`BaseMapperX`、`LambdaQueryWrapperX`），统一了所有模块的数据访问模式。

**关键配置：**
- ID 策略：雪花算法（`ASSIGN_ID`）
- 逻辑删除：已启用（`deleted` 列，1=已删除，0=未删除）
- 驼峰映射：已启用（`map-underscore-to-camel-case: true`）
- 连接池：Druid（含监控功能）
- 多租户：框架级别已启用

---

## 查询模式

### Mapper 接口

所有 Mapper 继承 `BaseMapperX<T>`（框架增强的 BaseMapper）。查询方法以 `default` 方法实现——标准查询无需 XML。

```java
@Mapper
public interface DemoMapper extends BaseMapperX<DemoDO> {

    default PageResult<DemoDO> selectPage(DemoPageReqVO reqVO) {
        return selectPage(reqVO, new LambdaQueryWrapperX<DemoDO>()
                .likeIfPresent(DemoDO::getDemoName, reqVO.getDemoName())
                .likeIfPresent(DemoDO::getCreatorName, reqVO.getCreatorName())
                .betweenIfPresent(DemoDO::getCreateTime, reqVO.getCreateTime())
                .orderByDesc(DemoDO::getId));
    }
}
```

### 核心查询约定

- **条件查询**：使用 `xxxIfPresent()` 方法——仅在参数非空时才添加条件
- **范围查询**：使用 `betweenIfPresent()` 配合 `LocalDateTime[]` 数组进行时间范围过滤
- **分页**：使用 `selectPage(reqVO, wrapper)` 返回 `PageResult<DO>`——框架自动处理偏移量/限制
- **排序**：默认使用 `orderByDesc(DO::getId)` 保证结果排序一致性
- **关联查询**：使用 `mybatis-plus-join`，默认表别名 `t`，支持子表逻辑删除

### 标准 Mapper 方法命名

| 操作 | 方法名           |
| ---- | ---------------- |
| 新增 | `insert`         |
| 修改 | `updateById`     |
| 删除 | `deleteBatchIds` |
| 单条 | `selectById`     |
| 分页 | `selectPage`     |
| 列表 | `selectList`     |

---

## 数据对象（DO）约定

```java
@TableName("syfb_demo")                    // 表名，带业务前缀
@KeySequence("syfb_demo_seq")              // Oracle/PostgreSQL 兼容序列
@Data
@EqualsAndHashCode(callSuper = true)
@ToString(callSuper = true)
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DemoDO extends BaseDO {      // 继承框架审计字段

    @TableId                               // 雪花算法 ID（ASSIGN_ID）
    private Long id;
    private String demoName;
}
```

### BaseDO 继承字段

框架 `BaseDO` 自动提供以下审计字段：
- `createTime`（LocalDateTime）
- `updateTime`（LocalDateTime）
- `creator`（String）
- `updater`（String）
- `deleted`（Boolean，逻辑删除）
- `tenantId`（Long，多租户）

---

## 命名约定

### 表名

- **业务表**：前缀 `syfb_` + 蛇形命名（如 `syfb_demo`、`syfb_contract`、`syfb_clue`）
- **系统表**：由框架管理（不使用 `syfb_` 前缀）
- **Quartz 表**：`QRTZ_` 前缀（框架管理）

### 列名

- 蛇形命名（通过 MyBatis-Plus 配置自动映射为 Java 驼峰命名）
- 标准审计列继承自 `BaseDO`：`create_time`、`update_time`、`creator`、`updater`、`deleted`、`tenant_id`
- 主键：`id`（BIGINT，雪花算法生成）

### 序列名

- `{table_name}_seq`，用于 Oracle/PostgreSQL 兼容（如 `syfb_demo_seq`）

---

## 数据库迁移

- SQL 脚本存放在 `syfb-backend/sql/` 目录
- 命名约定：`{NN}-{description}.sql`（如 `01-system.sql`、`05-update.sql`）
- 脚本通过手动执行或 CI/CD 流水线执行
- 当前未使用自动迁移工具（Flyway/Liquibase）

---

## 常见错误

1. **忘记 `@TableName`**：每个 DO 必须有明确的 `@TableName` 注解，且与数据库表名对应
2. **未使用 `IfPresent` 方法**：始终使用 `likeIfPresent()` / `eqIfPresent()` 代替手动判空——防止空字符串查询
3. **缺少 `@KeySequence`**：Oracle/PostgreSQL 部署时必须配置；省略会导致非 MySQL 数据库的 ID 生成失败
4. **Mapper 中直接写 SQL**：优先使用 `LambdaQueryWrapperX` 而非原始 SQL 字符串，以保证类型安全
5. **未继承 `BaseDO`**：所有 DO 必须继承 `BaseDO`，以获得审计字段和逻辑删除支持
