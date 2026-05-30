<script setup lang="ts">
import { computed } from 'vue'
import { data as allPosts } from './recent-posts.data'

const props = withDefaults(defineProps<{ limit?: number }>(), { limit: 6 })

const posts = computed(() => allPosts.slice(0, props.limit))
</script>

<template>
  <section class="home-section">
    <h2 class="home-section-title">最近更新</h2>
    <div v-if="posts.length" class="home-grid">
      <a
        v-for="post in posts"
        :key="post.url"
        class="home-card"
        :href="post.url"
      >
        <span class="home-card-tag">{{ post.tag }}</span>
        <p class="home-card-title">{{ post.title }}</p>
        <p v-if="post.desc" class="home-card-desc">{{ post.desc }}</p>
      </a>
    </div>
    <p v-else class="home-recent-empty">暂无带 <code>date</code> 的文章；新增文档时在 frontmatter 填写发布日期即可出现在此。</p>
  </section>
</template>
