// Card dealing animation on load
document.addEventListener('DOMContentLoaded', () => {
  const cards = document.querySelectorAll('.card.dealt');

  cards.forEach((card, i) => {
    setTimeout(() => {
      card.classList.add('deal-in');
    }, 200 + i * 150);
  });

  // subtle tilt on mouse move for main cards
  cards.forEach(card => {
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      card.style.transform = `translateY(-16px) rotateY(${x * 4}deg) rotateX(${-y * 4}deg)`;
    });

    card.addEventListener('mouseleave', () => {
      card.style.transform = '';
    });
  });
});
