package br.unesp.cti.nsac;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import java.util.concurrent.atomic.AtomicInteger;
import org.junit.Test;

/**
 * Unit tests guarding against the Android 12+ core-splashscreen:1.0.1 NPE where
 * SplashScreenViewProvider.ViewImpl31.getIconView() throws NullPointerException when
 * the system hands over an iconless solid-color SplashScreenView (e.g., on screen-off/on,
 * lockscreen unlock, or uiMode change while locked).
 */
public class SplashExitSafetyTest {

    @Test
    public void resolveSplashIconViewSafely_returnsNullWhenCompatSupplierThrowsNpe() {
        // Simulates androidx.core.splashscreen.SplashScreenViewProvider$ViewImpl31.getIconView
        // throwing NullPointerException on `platformSplashScreenView.iconView!!`.
        assertNull(MainActivity.resolveSplashIconViewSafely(null, () -> {
            throw new NullPointerException("platformSplashScreenView.iconView was null");
        }));
    }

    @Test
    public void resolveSplashIconViewSafely_returnsNullWhenSupplierIsNull() {
        assertNull(MainActivity.resolveSplashIconViewSafely(null, null));
    }

    @Test
    public void createIdempotentSplashRemover_invokesRemoveAtMostOnce() {
        AtomicInteger calls = new AtomicInteger(0);
        Runnable remover = MainActivity.createIdempotentSplashRemover(calls::incrementAndGet);

        remover.run();
        remover.run();
        remover.run();

        assertEquals(1, calls.get());
    }

    @Test
    public void createIdempotentSplashRemover_swallowsFrameworkExceptions() {
        AtomicInteger calls = new AtomicInteger(0);
        Runnable remover = MainActivity.createIdempotentSplashRemover(() -> {
            calls.incrementAndGet();
            throw new IllegalStateException("SplashScreenView already detached");
        });

        remover.run();
        remover.run();

        assertEquals(1, calls.get());
    }
}
