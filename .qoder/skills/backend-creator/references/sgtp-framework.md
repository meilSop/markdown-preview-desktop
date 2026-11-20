# sgtp 框架核心类参考

本文档列出项目中使用的 sgtp 框架核心类。这些类来自私有 Maven 仓库，不在当前项目源码中。

## 基础包路径

- groupId: `com.sungrow.sgtp`
- 版本: `2.1.5`
- 框架来源: 芋道 ruoyi-vue-pro

---

## 通用类

### CommonResult — 统一返回结果

```java
import com.sungrow.sgtp.framework.common.pojo.CommonResult;
import static com.sungrow.sgtp.framework.common.pojo.CommonResult.success;

// 成功返回
return success(data);           // CommonResult<T>
return success(true);           // CommonResult<Boolean>

// 框架自动将异常封装为 CommonResult
// 成功: { "code": 0, "data": {...}, "msg": "" }
// 失败: { "code": 1020000000, "data": null, "msg": "xxx不存在" }
```

### PageParam — 分页请求基类

```java
import com.sungrow.sgtp.framework.common.pojo.PageParam;

// PageReqVO 继承此类，自动获得 pageNo、pageSize 字段
// PAGE_SIZE_NONE = -1，用于导出时不分页
pageReqVO.setPageSize(PageParam.PAGE_SIZE_NONE);
```

### PageResult — 分页结果

```java
import com.sungrow.sgtp.framework.common.pojo.PageResult;

// Service 返回 PageResult<DO>，Controller 转换为 PageResult<RespVO>
PageResult<XxxDO> pageResult = xxxService.getXxxPage(pageReqVO);
return success(BeanUtils.toBean(pageResult, XxxRespVO.class));
```

### DeleteByIdsVO — 批量删除请求

```java
import com.sungrow.sgtp.framework.common.pojo.DeleteByIdsVO;

// Controller 删除接口统一使用
@PostMapping("/delete")
public CommonResult<Boolean> deleteXxx(@Valid @RequestBody DeleteByIdsVO deleteReqVO) {
    xxxService.deleteXxx(deleteReqVO.getIds());
    return success(true);
}
```

---

## 工具类

### BeanUtils — 对象转换

```java
import com.sungrow.sgtp.framework.common.util.object.BeanUtils;

// DO → VO
XxxRespVO respVO = BeanUtils.toBean(xxxDO, XxxRespVO.class);

// VO → DO
XxxDO xxxDO = BeanUtils.toBean(createReqVO, XxxDO.class);

// PageResult<DO> → PageResult<VO>
PageResult<XxxRespVO> result = BeanUtils.toBean(pageResult, XxxRespVO.class);

// List<DO> → List<VO>
List<XxxRespVO> list = BeanUtils.toBean(doList, XxxRespVO.class);
```

### ServiceExceptionUtil — 异常抛出

```java
import com.sungrow.sgtp.framework.common.exception.util.ServiceExceptionUtil;

// 在 Service 中抛出业务异常
throw ServiceExceptionUtil.exception(ErrorCodeConstants.XXX_NOT_EXISTS);
```

### ExcelUtils — Excel 导出

```java
import com.sungrow.sgtp.framework.excel.core.util.ExcelUtils;

// 在 Controller 导出接口中使用
ExcelUtils.write(response, "xxx.xls", "数据", XxxRespVO.class, dataList);
```

---

## 数据访问

### BaseDO — 数据对象基类

```java
import com.sungrow.sgtp.framework.mybatis.core.dataobject.BaseDO;

// 所有 DO 必须继承 BaseDO
// 自动提供以下审计字段：
// - createTime (LocalDateTime)
// - updateTime (LocalDateTime)
// - creator (String)
// - updater (String)
// - deleted (Boolean, 逻辑删除)
// - tenantId (Long, 多租户)
```

### BaseMapperX — Mapper 基类

```java
import com.sungrow.sgtp.framework.mybatis.core.mapper.BaseMapperX;

// 所有 Mapper 必须继承 BaseMapperX
// 提供增强的 CRUD 方法：
// - insert(entity)
// - updateById(entity)
// - deleteBatchIds(ids)
// - selectById(id)
// - selectPage(pageReqVO, wrapper)
// - selectList(wrapper)
```

### LambdaQueryWrapperX — 查询构造器

```java
import com.sungrow.sgtp.framework.mybatis.core.query.LambdaQueryWrapperX;

// 核心方法：xxxIfPresent() — 仅在参数非空时添加条件
new LambdaQueryWrapperX<XxxDO>()
    .likeIfPresent(XxxDO::getName, reqVO.getName())          // 模糊匹配
    .eqIfPresent(XxxDO::getStatus, reqVO.getStatus())         // 精确匹配
    .betweenIfPresent(XxxDO::getCreateTime, reqVO.getCreateTime())  // 时间范围
    .orderByDesc(XxxDO::getId);                               // 默认排序
```

---

## 校验

### ValidatedGroup — 校验分组

```java
import com.sungrow.sgtp.framework.common.validation.ValidatedGroup;

// CREATE 分组：id 必须为 null
@Null(message = "主键id需为空", groups = {ValidatedGroup.CREATE.class})

// UPDATE 分组：id 不能为 null
@NotNull(message = "主键id不能为空", groups = {ValidatedGroup.UPDATE.class})

// Controller 中使用
@Validated(ValidatedGroup.CREATE.class) @RequestBody XxxSaveReqVO createReqVO
@Validated(ValidatedGroup.UPDATE.class) @RequestBody XxxSaveReqVO updateReqVO
```

---

## 日志

### ApiAccessLog — API 访问日志

```java
import com.sungrow.sgtp.framework.apilog.core.annotation.ApiAccessLog;
import static com.sungrow.sgtp.framework.apilog.core.enums.OperateTypeEnum.EXPORT;

// 标注在导出接口上，自动记录访问日志
@GetMapping("/export-excel")
@ApiAccessLog(operateType = EXPORT)
public void exportXxxExcel(...) { ... }
```

### @Slf4j — 应用日志

```java
import lombok.extern.slf4j.Slf4j;

@Slf4j
public class XxxServiceImpl {
    // 使用 {} 占位符，禁止字符串拼接
    log.info("创建xxx成功，id: {}", id);
    log.warn("校验xxx失败: {}", reason);
    log.error("操作xxx异常", exception);
}
```

---

## 定时任务

### JobHandler — 任务接口

```java
import com.sungrow.sgtp.framework.quartz.core.handler.JobHandler;
import com.sungrow.sgtp.framework.tenant.core.job.TenantJob;

@Slf4j
@Component
public class XxxJob implements JobHandler {

    @TenantJob  // 多租户支持
    @Override
    public String execute(String param) throws Exception {
        log.info("执行xxx定时任务");
        // 业务逻辑
        return StringUtils.EMPTY;
    }
}
```

---

## 错误码

### ErrorCode — 错误定义

```java
import com.sungrow.sgtp.framework.common.exception.ErrorCode;

// 在 ErrorCodeConstants 中定义
ErrorCode XXX_NOT_EXISTS = new ErrorCode(1_020_100_001, "xxx不存在");

// 格式：1-0XX-YYY-ZZZ
// 1: 固定前缀
// 0XX: 模块编号（020 = portal）
// YYY: 子模块/实体编号
// ZZZ: 错误序号
```
