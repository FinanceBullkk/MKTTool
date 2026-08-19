/**
 * TikTok Video Player Observer
 *
 * Cung cấp logic và script trích xuất trạng thái thời gian thực của Video Player
 * đang phát trên feed For You Page (FYP) của TikTok Web.
 */

export interface TikTokVideoState {
  found: boolean;
  duration: number; // Tổng thời lượng video (giây)
  currentTime: number; // Tiến độ phát hiện tại (giây)
  isPaused: boolean;
  isMuted: boolean;
  isLive: boolean; // Có phải là TikTok Live stream không
  isSponsored: boolean; // Có phải video quảng cáo / TikTok Shop Ads không
  author: string;
  caption: string;
  hashtags: string[];
  isLiked: boolean;
}

/**
 * Script JavaScript thực thi trực tiếp trên trang TikTok qua Runtime.evaluate
 * để đọc thông tin thẻ <video> đang hiển thị trong viewport.
 */
export const TIKTOK_OBSERVER_DOM_SNIPPET = `
(function() {
  // Tìm thẻ video đang phát trong viewport
  const videos = Array.from(document.querySelectorAll('video'));
  let activeVideo = null;
  let maxVisibleHeight = 0;

  for (const v of videos) {
    const rect = v.getBoundingClientRect();
    const visibleHeight = Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0);
    if (visibleHeight > maxVisibleHeight && visibleHeight > 200) {
      maxVisibleHeight = visibleHeight;
      activeVideo = v;
    }
  }

  if (!activeVideo) {
    return {
      found: false,
      duration: 0,
      currentTime: 0,
      isPaused: true,
      isMuted: true,
      isLive: false,
      isSponsored: false,
      author: '',
      caption: '',
      hashtags: [],
      isLiked: false,
    };
  }

  // Tìm container bao bọc video hiện tại
  const container = activeVideo.closest('[data-e2e="recommend-list-item-container"]') ||
                    activeVideo.closest('[data-e2e="feed-item"]') ||
                    activeVideo.closest('div[class*="DivItemContainer"]');

  // Kiểm tra Livestream
  const isLive = document.body.innerText.includes('LIVE') && (
    container ? container.innerText.includes('LIVE') : false
  );

  // Kiểm tra Video Được tài trợ / Quảng cáo
  const isSponsored = container ? (
    container.innerText.includes('Sponsored') ||
    container.innerText.includes('Được tài trợ') ||
    container.innerText.includes('Shop') ||
    !!container.querySelector('[data-e2e="ad-icon"]')
  ) : false;

  // Lấy tác giả & Caption
  let author = '';
  let caption = '';
  const hashtags = [];

  if (container) {
    const authorEl = container.querySelector('[data-e2e="browse-user-avatar"]') ||
                     container.querySelector('[data-e2e="video-author-uniqueid"]') ||
                     container.querySelector('a[href*="/@"]');
    if (authorEl) {
      author = (authorEl.textContent || authorEl.getAttribute('href') || '').replace(/^.*@/, '').trim();
    }

    const captionEl = container.querySelector('[data-e2e="video-desc"]') ||
                      container.querySelector('[data-e2e="browse-video-desc"]');
    if (captionEl) {
      caption = captionEl.textContent || '';
      const matches = caption.match(/#[a-zA-Z0-9_\u00C0-\u1EF9]+/g);
      if (matches) {
        hashtags.push(...matches.map(h => h.toLowerCase()));
      }
    }

    // Kiểm tra trạng thái đã like chưa
    const likeBtn = container.querySelector('[data-e2e="like-icon"]') ||
                    container.querySelector('button[aria-label*="Like"]');
    var isLiked = false;
    if (likeBtn) {
      const svg = likeBtn.querySelector('svg');
      isLiked = !!(svg && (svg.getAttribute('fill') === 'currentColor' || svg.style.color?.includes('rgb(254, 44, 85)')));
    }
  }

  return {
    found: true,
    duration: Math.round((activeVideo.duration || 0) * 10) / 10,
    currentTime: Math.round((activeVideo.currentTime || 0) * 10) / 10,
    isPaused: activeVideo.paused,
    isMuted: activeVideo.muted,
    isLive,
    isSponsored,
    author,
    caption,
    hashtags,
    isLiked: !!isLiked,
  };
})();
`;
