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
  });
});
