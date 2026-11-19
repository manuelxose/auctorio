import { TestBed } from '@angular/core/testing';
import { SocialCarouselComponent } from './social-carousel.component';

describe('SocialCarouselComponent', () => {
  it('wraps in both directions and resets when the number of slides changes', () => {
    const fixture = TestBed.createComponent(SocialCarouselComponent);
    fixture.componentRef.setInput('slides', [{ headline: 'Portada' }, { headline: 'Cierre' }]);
    const carousel = fixture.componentInstance;
    carousel.move(-1);
    expect(carousel.position()).toBe(1);
    carousel.move(1);
    expect(carousel.position()).toBe(0);
    carousel.move(1);
    fixture.componentRef.setInput('slides', [{ headline: 'Nueva portada' }]);
    carousel.move(-1);
    expect(carousel.position()).toBe(0);
  });
});
