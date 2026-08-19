import React from 'react';

// A user's chosen title, drawn louder the rarer it is. Rarity comes from the
// server so the badge tier and the styling can never disagree.
export default function FlairTitle({ title, rarity, size = 'md', className = '' }) {
  if (!title) return null;
  return (
    <span className={`flair flair-${rarity || 'common'} flair-${size} ${className}`.trim()}>
      {title}
    </span>
  );
}
