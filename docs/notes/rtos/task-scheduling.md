# FreeRTOS 任务调度

## 背景

FreeRTOS 是最常用的嵌入式 RTOS 之一。理解任务调度机制，是阅读 RTOS 源码和排查并发问题的基础。

## 任务状态

FreeRTOS 中任务主要有以下状态：

| 状态 | 说明 |
|------|------|
| Running | 正在 CPU 上执行 |
| Ready | 就绪，等待调度 |
| Blocked | 阻塞（等待信号量、队列、延时等） |
| Suspended | 被挂起 |
| Deleted | 已删除，等待清理 |

## 调度器核心逻辑（示意）

```c
void vTaskSwitchContext(void)
{
    /* 选择优先级最高的就绪任务 */
    taskSELECT_HIGHEST_PRIORITY_TASK();
    /* 切换上下文 */
    portYIELD();
}
```

## 实验记录

- [ ] 创建两个不同优先级的任务，观察抢占行为
- [ ] 使用 `vTaskDelay()` 验证时间片轮转
- [ ] 用逻辑分析仪观察 GPIO 翻转时序

## 总结

调度器本质是：**在就绪任务中选择优先级最高者运行**；同优先级任务按时间片轮转。

## 参考

- [FreeRTOS 官方文档 - Task Management](https://www.freertos.org/taskandcr.html)
