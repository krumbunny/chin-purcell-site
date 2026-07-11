---
layout: base.njk
title: Archive
permalink: /posts/
---
{% from "post-card.njk" import card %}
<section class="wrap">
  <h1>Archive</h1>
  <div class="post-grid">
    {% for post in collections.posts %}
      {{ card(post) }}
    {% endfor %}
  </div>
</section>
