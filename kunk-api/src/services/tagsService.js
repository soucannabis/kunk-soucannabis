'use strict';

const { query } = require('../db/pool');
const { getOrSet, memoryCache, cacheTtl, keys } = require('../cache');

async function listByContext(contexts) {
  const cacheKey = contexts ? keys.tagsContext(String(contexts)) : keys.TAGS_ALL;
  return getOrSet(cacheKey, cacheTtl.TAGS_MS, async () => {
    if (!contexts) {
      const result = await query(`SELECT * FROM tags ORDER BY id DESC`);
      return result.rows;
    }
    const result = await query(
      `SELECT * FROM tags WHERE contexts ILIKE $1 ORDER BY id DESC`,
      [`%${contexts}%`]
    );
    return result.rows;
  });
}

function invalidateTagsCache() {
  memoryCache.invalidatePrefix('tags:');
}

module.exports = { listByContext, invalidateTagsCache };
