import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { InstructionPanel } from './InstructionPanel.js';

describe('InstructionPanel video', () => {
  it('shows an optional button instead of the inline player when text and a video file exist', () => {
    const { container } = render(<InstructionPanel spec={{ text: 'Read me', video_url: 'https://cdn.x.io/a.mp4' }} />);
    expect(screen.getByTestId('instruction-video-optional')).toBeInTheDocument();
    expect(container.querySelector('video')).toBeNull();
    expect(screen.queryByTestId('media-lightbox')).toBeNull();
    fireEvent.click(screen.getByTestId('instruction-video-optional'));
    expect(screen.getByTestId('media-lightbox')).toBeInTheDocument();
    expect(document.querySelector('video')).toHaveAttribute('src', 'https://cdn.x.io/a.mp4');
  });

  it('keeps the inline player for a video-only instruction', () => {
    const { container } = render(<InstructionPanel spec={{ video_url: 'https://cdn.x.io/a.mp4' }} />);
    expect(screen.queryByTestId('instruction-video-optional')).toBeNull();
    expect(container.querySelector('video')).not.toBeNull();
  });

  it('keeps the inline player when inlineVideo is set', () => {
    const { container } = render(<InstructionPanel inlineVideo spec={{ text: 'Hi', video_url: 'https://cdn.x.io/a.mp4' }} />);
    expect(screen.queryByTestId('instruction-video-optional')).toBeNull();
    expect(container.querySelector('video')).not.toBeNull();
  });

  it('keeps the external card for a video page next to text', () => {
    render(<InstructionPanel spec={{ text: 'Hi', video_url: 'https://www.youtube.com/watch?v=abc' }} />);
    expect(screen.queryByTestId('instruction-video-optional')).toBeNull();
    expect(screen.getByTestId('instruction-video-external')).toBeInTheDocument();
  });

  it('takes the inline path for a .mov file', () => {
    const { container } = render(<InstructionPanel spec={{ text: 'Hi', video_url: 'https://cdn.x.io/a.mov' }} />);
    expect(screen.queryByTestId('instruction-video-optional')).toBeNull();
    expect(container.querySelector('video')).not.toBeNull();
  });

  it('replaces the pill with the inline fallback once the lightbox video fails', () => {
    render(<InstructionPanel spec={{ text: 'Hi', video_url: 'https://cdn.x.io/broken.mp4' }} />);
    fireEvent.click(screen.getByTestId('instruction-video-optional'));
    fireEvent.error(document.querySelector('video') as HTMLVideoElement);
    expect(screen.queryByTestId('media-lightbox')).toBeNull();
    expect(screen.queryByTestId('instruction-video-optional')).toBeNull();
    expect(screen.getByTestId('instruction-video')).toBeInTheDocument();
  });
});

describe('InstructionPanel description', () => {
  it('beside an image, the description is the image text alternative and is not drawn', () => {
    render(<InstructionPanel spec={{ text: 'Read me', image_url: 'https://cdn.x.io/a.png', description: 'A tag up close' }} />);
    expect(screen.queryByTestId('instruction-description')).toBeNull();
    expect(screen.getByAltText('A tag up close')).toBeInTheDocument();
  });

  it('without an image, the description is still drawn', () => {
    render(<InstructionPanel spec={{ text: 'Read me', description: 'A note' }} />);
    expect(screen.getByTestId('instruction-description')).toHaveTextContent('A note');
  });
});
