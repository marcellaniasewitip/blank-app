package com.cooperwaters.core

import com.cooperwaters.core.money.Money
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class MoneyTest {
    @Test fun formatsToeaAsKina() {
        assertEquals("K12.50", Money.format(1250L))
        assertEquals("K0.00", Money.format(0L))
        assertEquals("K0.05", Money.format(5L))
        assertEquals("K0.50", Money.format(50L))
        assertEquals("K80.00", Money.format(8000L))
        assertEquals("K1,250.00", Money.format(125_000L))
        assertEquals("K1,234,567.89", Money.format(123_456_789L))
        assertEquals("-K5.00", Money.format(-500L))
        assertEquals("K12.50", Money.format(1250))
    }

    @Test fun signedFormat() {
        assertEquals("+K10.00", Money.formatSigned(1000))
        assertEquals("-K10.00", Money.formatSigned(-1000))
        assertEquals("K0.00", Money.formatSigned(0))
    }

    @Test fun toInputRoundTrips() {
        assertEquals("12.50", Money.toInput(1250))
        assertEquals("1250.00", Money.toInput(125_000))
        assertEquals(125_000L, Money.parseKina(Money.toInput(125_000)))
    }

    @Test fun parsesUserInputExactly() {
        assertEquals(1200L, Money.parseKina("12"))
        assertEquals(1250L, Money.parseKina("12.5"))
        assertEquals(1250L, Money.parseKina("12.50"))
        assertEquals(1205L, Money.parseKina("12.05"))
        assertEquals(1250L, Money.parseKina(" K12.50 "))
        assertEquals(1250L, Money.parseKina("k 12.50"))
        assertEquals(1250L, Money.parseKina("PGK 12.50"))
        assertEquals(125_000L, Money.parseKina("1,250.00"))
        assertEquals(1_250_000L, Money.parseKina("12,500"))
        assertEquals(1200L, Money.parseKina("12."))
        assertEquals(50L, Money.parseKina(".5"))
        assertEquals(10L, Money.parseKina("0.10"))
        assertEquals(1200L, Money.parseKina("0012"))
        // 0.1 + 0.2 style float traps cannot happen: string arithmetic.
        assertEquals(30L, Money.parseKina("0.30"))
        assertEquals(1_999_999_99L, Money.parseKina("1999999.99"))
    }

    @Test fun rejectsInvalidInput() {
        assertNull(Money.parseKina(""))
        assertNull(Money.parseKina("   "))
        assertNull(Money.parseKina("K"))
        assertNull(Money.parseKina("-5"))
        assertNull(Money.parseKina("12.505"))
        assertNull(Money.parseKina("12,50"))
        assertNull(Money.parseKina("1,2500"))
        assertNull(Money.parseKina("abc"))
        assertNull(Money.parseKina("12a"))
        assertNull(Money.parseKina("1e3"))
        assertNull(Money.parseKina("."))
        assertNull(Money.parseKina("99999999999999999999"))
        assertNull(Money.parseKina("10000001")) // above MAX_INPUT_TOEA
    }
}
