int add2(int a, int b, int c, int d, int e, int f, int g, int h, int i, int j) {
    return a + b + c + d + e + f + g + h + i + j;
}

int add1(int a, int b) {
    return add2(a, b, 3, 4, 5, 6, 7, 8, 9, 10);
}

int main(int argc, char *argv[]) {
    volatile int local = 0xffff;
    return add1(1, 2);
}
