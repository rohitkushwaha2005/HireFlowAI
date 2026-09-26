import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Markdown } from './markdown';

describe('Markdown', () => {
  it('renders paragraphs, lists and inline formatting', () => {
    const { container } = render(
      <Markdown
        content={
          'Found **2** candidates:\n\n- **Maya Chen** — `React` 5 yrs\n- _Leo Park_\n\n1. First\n2. Second'
        }
      />,
    );
    expect(screen.getByText('Maya Chen').tagName).toBe('STRONG');
    expect(screen.getByText('React').tagName).toBe('CODE');
    expect(screen.getByText('Leo Park').tagName).toBe('EM');
    expect(container.querySelectorAll('ul > li')).toHaveLength(2);
    expect(container.querySelectorAll('ol > li')).toHaveLength(2);
  });

  it('never renders HTML from the content (XSS-safe)', () => {
    const { container } = render(
      <Markdown content={'<img src=x onerror=alert(1)> <script>alert(1)</script> **bold**'} />,
    );
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    expect(container.textContent).toContain('<img src=x onerror=alert(1)>');
  });
});
