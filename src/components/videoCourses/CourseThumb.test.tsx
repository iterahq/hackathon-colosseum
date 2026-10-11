import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { CourseThumb } from './CourseThumb';

describe('CourseThumb', () => {
  it('draws the designed cover with the title when there is no image', () => {
    render(<CourseThumb title="Vibe Coding" slug="vibe" src={null} />);
    expect(screen.getByTestId('thumb-fallback')).toHaveTextContent('Vibe Coding');
  });

  it('falls back to the cover when the image fails', () => {
    const { container } = render(<CourseThumb title="Vibe Coding" slug="vibe" src="https://x/missing.jpg" />);
    fireEvent.error(container.querySelector('img')!);
    expect(screen.getByTestId('thumb-fallback')).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
  });

  it('keeps the designed cover under the picture until it has loaded, then fades the picture in', () => {
    render(<CourseThumb title="Vibe Coding" slug="vibe" src="https://x/cover.png" />);
    const image = screen.getByTestId('thumb-image');
    expect(image).toHaveAttribute('data-loaded', 'false');
    expect(image.className).toContain('opacity-0');
    expect(screen.getByTestId('thumb-fallback')).not.toHaveAttribute('data-covered');
    fireEvent.load(image);
    expect(image).toHaveAttribute('data-loaded', 'true');
    expect(image.className).toContain('opacity-100');
    expect(screen.getByTestId('thumb-fallback')).toHaveAttribute('data-covered', 'true');
  });
});
