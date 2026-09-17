---
name: debug-note
description: >-
  Publish a blogD debug note from Redmine, lab notes, or internal write-ups.
  Phase A: write one complete draft that already satisfies blogD doc rules.
  Phase B: revise one named step per turn — desensitize, reading-order, blog
  voice, Chinese pass, wrap-up. Use when the user asks for 调试笔记,
  Redmine→博客, blogD 新文章, or to 继续 / 下一步 the debug-note pipeline.
---

# blogD 调试笔记流水线

## 你到底要干什么

两段式，不要混成一次「读完规则出终稿」：

1. **S1：按 blogD 的 doc 要求，一次写完整篇初稿**（结构、frontmatter、用词规范都按规则来，文章要完整可读）。
2. **S2 起：在已有全文上，一轮对话只改一类问题。** 顺序固定为：脱敏 → 顺序阅读 → 博客定位 → 中文复审 → 收尾。上下文有限，**禁止**把多步改稿揉进同一轮。

**错误理解（禁止）：** 开局略读总纲 → 边写边脱敏边润色 → 直接当终稿。  
**正确理解：** 先有一篇合格完整初稿，再按步骤逐项改；每步只认真做一件事。

改稿顺序理由（勿擅自调换）：先清敏感信息（后面通读上下文更干净）→ 先动结构 → 再定读者向开篇/结论 → 最后逐句收中文（避免大块改写作废打磨）。

---

## 硬规则

1. **先 S1 成篇，再 S2+ 分步改。**
2. **每一轮对话只执行清单上的一个步骤。** 做完就停：说清改了什么、勾到哪、下一步是什么。用户未说「继续 / 下一步 / 做 Sx」时，不要自行连做。
3. 「继续 / 下一步」→ 只做**下一个未勾**项；点名 `Sx` → 只做那一项。
4. **S1 必须读并遵守写稿所需的 doc 规则**（见 S1），把完整初稿写好。  
   **S2+ 每步只读该步需要的材料**，只改该步清单里的问题——不是「少读规则」，而是「改稿时不要顺手把后面几步做掉」。
5. 未要求则不 commit / 不 push / 不开 PR。

进度（写在每轮回复末尾）：

```
debug-note 进度:
- [ ] S0 分支就绪
- [ ] S1 完整初稿（按 doc 写完）
- [ ] S2 脱敏
- [ ] S3 顺序阅读修改
- [ ] S4 博客定位修改
- [ ] S5 中文习惯复审
- [ ] S6 收尾（index / sidebar / 自查）
```

---

## S0 — 分支就绪

**只做 Git，不写文章。**

1. 删已合并本地废支；`git fetch --prune`；远端已合并可删则删。
2. 未合并 `wip/...` 默认保留。
3. `git checkout main && git pull`
4. `git checkout -b post/debug/<短横线主题>`

停 → 下一步 S1。

---

## S1 — 完整初稿（按 doc 写完一整篇）

**本步就是「按 doc 要求写文章」。** 读够写稿规则，交出**完整**初稿；不要留空壳章节。

本步应读：

- `.cursor/rules/adding-docs.mdc`
- `.cursor/rules/doc-conventions.mdc`
- `.cursor/rules/doc-wording.mdc`
- `.cursor/rules/doc-narrative.mdc`
- 同目录一篇范文结构（如 `docs/analysis/kernel/debug/usb/usb-wifi-reboot-power-residue.md`）
- 可选：`docs/analysis/kernel/debug/template.md`

本步交付：

1. `docs/analysis/kernel/debug/<子系统>/<kebab>.md` 全文完整（现象、结论、展开、小结/附录按题材裁剪，但要写完）。
2. frontmatter 与引用块按 conventions；站内链、图路径按约定挂上。
3. 初稿**允许**仍带内部路径、原文日志、工单语境——留给 S2（脱敏）与 S4（博客定位），**不要**在 S1 里把后面整条改稿链做完。

停 → 下一步 S2。

---

## S2 — 脱敏

**只去敏感信息。** 不改章节结构，不做文风润色。放在分步改稿第一步，减轻后续通读的上下文负担。

| 类别 | 处理 |
|------|------|
| 源码路径 / 工程名 / demo 名 | 泛化 |
| 芯片代号、板名、物理 MMIO | 删或「因 SoC 而异」 |
| VID/PID、客户名、工单号、内网 URL | 去掉 |
| 产品特有字段 | 打码或示意 |
| 截图含上述内容 | 重做或遮罩 |

停 → 下一步 S3。

---

## S3 — 顺序阅读修改

**只解决按顺序读是否卡壳**（结构层）。

- 术语是否在首次使用前交代
- 是否两节重复
- 前文疑点后文是否收掉
- 多图是否各有一句分工

本步可读 `doc-narrative.mdc` 里与顺序/桥接相关的条目。  
**不做** S4 开篇/小结重定位、**不做** S5 逐句中文复审。

停 → 下一步 S4。

---

## S4 — 博客定位修改

**只把备忘/工单腔改成公开博客读者向**（开篇、结论、小结等大块改写放在中文复审之前）。

瞄范文开篇、结论表、小结即可（如 wifi / floating-male 那两篇）。  
可改：标题与开篇钩子、结论问答表、小结清单、去掉对内旁白。

停 → 下一步 S5。

---

## S5 — 中文习惯复审

**只做表述复审**（S1 已按 wording 写过；本步专抓漏网的翻译腔、提纲箭头、整句堆英文、残缺缩略）。

再读 `.cursor/rules/doc-wording.mdc`，只改句子，不改技术结论与章节骨架。

停 → 下一步 S6。

---

## S6 — 收尾

**只做发布配套，不再改正文论证。**

1. `index.md` 链接与摘要（若缺；摘要跟最终标题）
2. `npm run sync:sidebar`
3. 链与 `sidebarTitle` 长度快查

停。等用户指示再 commit / PR。

---

## 中途插入

- 「只改某某」→ 单次任务；除非用户声明，否则不勾清单。
- 初稿缺节严重 → 回 **S1 补全**，不要在 S3～S5 边补边润色。
