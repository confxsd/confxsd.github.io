// Lightweight analytics with first-party cookie for accurate unique visitors
(function(){
  if (navigator.doNotTrack === '1') return;

  // Get or create a persistent visitor ID (1 year cookie)
  function vid() {
    var m = document.cookie.match(/(?:^|; )_vid=([^;]+)/);
    if (m) return m[1];
    var id = crypto.randomUUID ? crypto.randomUUID() :
      'xxxx-xxxx-xxxx'.replace(/x/g, function() {
        return (Math.random() * 16 | 0).toString(16);
      });
    document.cookie = '_vid=' + id + ';path=/;max-age=31536000;SameSite=Lax';
    return id;
  }

  var d = {
    p: location.pathname,
    h: location.hostname,
    r: document.referrer,
    w: screen.width,
    v: vid()
  };

  navigator.sendBeacon && navigator.sendBeacon(
    'https://api.rome.markets/api/analytics/collect',
    JSON.stringify(d)
  ) || fetch('https://api.rome.markets/api/analytics/collect', {
    method: 'POST',
    body: JSON.stringify(d),
    keepalive: true
  }).catch(function(){});
})();
