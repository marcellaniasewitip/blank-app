package com.cooperwaters.core.money

/**
 * PNG Kina money helpers. All amounts are integer toea (1 PGK = 100 toea) held in a Long —
 * never a Float/Double. Display format: `K12.50`, `K1,250.00`, `-K5.00`.
 */
object Money {
    const val TOEA_PER_KINA = 100L

    /** Largest amount we accept from user input (K10,000,000 — far above any real top-up). */
    const val MAX_INPUT_TOEA = 1_000_000_000L

    fun format(toea: Long): String {
        val negative = toea < 0
        // Long.MIN_VALUE cannot be negated; clamp (never a real amount anyway).
        val abs = if (toea == Long.MIN_VALUE) Long.MAX_VALUE else kotlin.math.abs(toea)
        val kina = abs / TOEA_PER_KINA
        val cents = abs % TOEA_PER_KINA
        val sb = StringBuilder()
        if (negative) sb.append('-')
        sb.append('K').append(group(kina)).append('.')
        if (cents < 10) sb.append('0')
        sb.append(cents)
        return sb.toString()
    }

    fun format(toea: Int): String = format(toea.toLong())

    /** "+K12.50" for credits, "-K12.50" for debits — wallet ledger rows. */
    fun formatSigned(toea: Long): String = if (toea > 0) "+" + format(toea) else format(toea)

    /** Plain amount for pre-filling an input field: 1250 → "12.50". */
    fun toInput(toea: Long): String = format(toea).replace("K", "").replace(",", "")

    /**
     * Parse what a user typed in Kina into toea, exactly (string arithmetic, no floating point).
     * Accepts "12", "12.5", "12.50", "K12.50", "k 12", "1,250.00", " 12.50 ".
     * Rejects empty/blank, negatives, more than 2 decimals, letters, and amounts above [MAX_INPUT_TOEA].
     * @return toea, or null if the text isn't a valid amount.
     */
    fun parseKina(input: String): Long? {
        var s = input.trim()
        if (s.startsWith("K") || s.startsWith("k")) s = s.substring(1).trim()
        if (s.startsWith("PGK", ignoreCase = true)) s = s.substring(3).trim()
        if (s.isEmpty()) return null
        if (s.startsWith(".") && s.length > 1) s = "0$s"
        if (s.contains(',')) {
            // Thousands separators must be well-formed: 1,250 or 12,500.50
            val intPart = s.substringBefore('.')
            if (!Regex("^\\d{1,3}(,\\d{3})+$").matches(intPart)) return null
            s = s.replace(",", "")
        }
        val m = Regex("^(\\d+)(?:\\.(\\d{0,2}))?$").matchEntire(s) ?: return null
        val wholeText = m.groupValues[1].trimStart('0').ifEmpty { "0" }
        if (wholeText.length > 12) return null
        val whole = wholeText.toLong()
        val fracText = m.groupValues[2]
        val frac = when (fracText.length) {
            0 -> 0L
            1 -> fracText.toLong() * 10
            else -> fracText.toLong()
        }
        val toea = whole * TOEA_PER_KINA + frac
        if (toea > MAX_INPUT_TOEA) return null
        return toea
    }

    private fun group(n: Long): String {
        val digits = n.toString()
        if (digits.length <= 3) return digits
        val sb = StringBuilder()
        val first = digits.length % 3
        if (first > 0) sb.append(digits, 0, first)
        var i = first
        while (i < digits.length) {
            if (sb.isNotEmpty()) sb.append(',')
            sb.append(digits, i, i + 3)
            i += 3
        }
        return sb.toString()
    }
}
