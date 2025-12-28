import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, Text, View, FlatList, TouchableOpacity, 
  Modal, Platform, StatusBar, Linking, Alert, TextInput, RefreshControl, ActivityIndicator, ScrollView
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

// --- إعدادات ---
const BACKEND_URL = "https://ayba97-makwa-backend.hf.space";
const OWNER_PHONE = "9647837941142"; 
const INSTAGRAM_URL = "https://www.instagram.com/ay.ba"; // 📸 رابط حسابك

const SERVICE_TYPES = { wash: 'غسيل فقط', iron: 'كوي فقط', both: 'غسيل وكوي' };

export default function App() {
  const [currentScreen, setCurrentScreen] = useState('splash');
  const [activeTab, setActiveTab] = useState('products'); 

  const [categories, setCategories] = useState([]); 
  const [isFetchingProducts, setIsFetchingProducts] = useState(false); 
  
  // Auth
  const [regName, setRegName] = useState("");
  const [regPhone, setRegPhone] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [loginPhone, setLoginPhone] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [currentUser, setCurrentUser] = useState(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(false);

  // Data
  const [adminOrders, setAdminOrders] = useState([]);
  const [myOrders, setMyOrders] = useState([]);

  // States للتفاعل
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState(null);
  
  // Cart
  const [cart, setCart] = useState([]);
  const [tempQty, setTempQty] = useState(1);
  const [tempService, setTempService] = useState('both');
  const [showCheckout, setShowCheckout] = useState(false);
  const [deliveryType, setDeliveryType] = useState('two_way');

  // --- useEffects ---
  useEffect(() => { 
      checkLoginStatus(); 
      loadCategories(); 
  }, []);

  useEffect(() => {
    let interval = null;
    if (currentScreen === 'admin') {
        fetchOrders(); interval = setInterval(fetchOrders, 10000); 
    }
    return () => { if (interval) clearInterval(interval); };
  }, [currentScreen]);

  useEffect(() => {
    if (currentScreen === 'home' && activeTab === 'orders') fetchMyOrders();
  }, [activeTab]);

  // --- APIs & Caching Logic ---
  
  const loadCategories = async () => {
      try {
          const cachedData = await AsyncStorage.getItem('cached_categories');
          if (cachedData) {
              setCategories(JSON.parse(cachedData));
          }
      } catch (e) { console.log("Cache error"); }
      fetchCategoriesFromServer();
  };

  const fetchCategoriesFromServer = async () => {
    setIsFetchingProducts(true);
    try {
      const response = await fetch(`${BACKEND_URL}/categories-v2`);
      const data = await response.json();
      setCategories(data);
      await AsyncStorage.setItem('cached_categories', JSON.stringify(data));
    } catch (error) { console.log("Server error categories"); } 
    finally { setIsFetchingProducts(false); }
  };

  const fetchOrders = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/all-orders`);
      const data = await response.json();
      setAdminOrders(data);
    } catch (e) { console.log("Error fetching orders"); }
  };

  const fetchMyOrders = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/all-orders`);
      const data = await response.json();
      const normalize = (p) => p ? p.replace(/\D/g, '').slice(-10) : "";
      const myPhone = normalize(currentUser?.phone);
      setMyOrders(data.filter(order => normalize(order.user_phone) === myPhone).reverse());
    } catch (e) { console.log("Error"); }
  };

  // --- Logic ---
  const addToCart = () => {
    if (!selectedProduct) return;
    const unitPrice = selectedProduct.prices[tempService];
    const newItem = { 
        id: Date.now(), 
        categoryName: selectedProduct.name, 
        parentCategory: selectedCategory.name, 
        service: tempService, 
        qty: tempQty, 
        totalPrice: unitPrice * tempQty 
    };
    setCart([...cart, newItem]); 
    setSelectedProduct(null); 
  };

  const removeFromCart = (itemId) => {
      const newCart = cart.filter(item => item.id !== itemId);
      setCart(newCart);
      if (newCart.length === 0) setShowCheckout(false); 
  };

  const sendOrderToServer = async () => {
    if (cart.length === 0) return;
    const deliveryCost = deliveryType === 'two_way' ? 2000 : 1000;
    const total = cart.reduce((sum, item) => sum + item.totalPrice, 0) + deliveryCost;
    let summary = "";
    cart.forEach(item => { summary += `- ${item.categoryName} (${SERVICE_TYPES[item.service]}) x${item.qty}\n`; });
    const deliveryText = deliveryType === 'two_way' ? 'ذهاب وإياب (2000)' : 'اتجاه واحد (1000)';
    summary += `\n🚛 التوصيل: ${deliveryText}`;

    try {
        await fetch(`${BACKEND_URL}/create-order`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_phone: currentUser?.phone, total_amount: total, items_summary: summary })
        });
        Alert.alert("نجاح", "تم إرسال طلبك بنجاح ✅");
        setCart([]); setShowCheckout(false);
        setActiveTab('orders'); 
    } catch (error) { Alert.alert("خطأ", "فشل الإرسال"); }
  };

  const calculateTotal = () => cart.reduce((sum, item) => sum + item.totalPrice, 0) + (deliveryType === 'two_way' ? 2000 : 1000);

  // --- Auth & Helper Functions ---
  const checkLoginStatus = async () => {
    try {
      const savedUser = await AsyncStorage.getItem('user_session');
      if (savedUser) {
        const user = JSON.parse(savedUser);
        setCurrentUser(user);
        const normalize = (p) => p.replace(/\D/g, '').replace(/^964/, '').replace(/^0/, '');
        if (normalize(user.phone) === normalize(OWNER_PHONE)) setCurrentScreen('admin'); else setCurrentScreen('home');
      } else setCurrentScreen('login');
    } catch (e) { setCurrentScreen('login'); }
  };
  const handleLogout = async () => {
    await AsyncStorage.removeItem('user_session'); setCurrentUser(null); setCart([]); setActiveTab('products'); setCurrentScreen('login');
  };
  const handleAuth = async (endpoint, payload, isLogin) => {
    setIsLoadingAuth(true);
    try {
      const response = await fetch(`${BACKEND_URL}/${endpoint}`, {
         method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (data.status === 'success') {
          if (isLogin) {
            const user = { name: data.user_name, phone: payload.phone };
            setCurrentUser(user); await AsyncStorage.setItem('user_session', JSON.stringify(user));
            const normalize = (p) => p.replace(/\D/g, '').replace(/^964/, '').replace(/^0/, '');
            if (normalize(payload.phone) === normalize(OWNER_PHONE)) setCurrentScreen('admin'); else setCurrentScreen('home');
          } else {
             const msg = `تفعيل حساب: ${payload.full_name}`;
             const url = `whatsapp://send?phone=${OWNER_PHONE}&text=${encodeURIComponent(msg)}`;
             if (Platform.OS === 'web') { window.open(`https://wa.me/${OWNER_PHONE}?text=${encodeURIComponent(msg)}`); setCurrentScreen('login'); }
             else { Linking.openURL(url); setCurrentScreen('login'); }
          }
      } else Alert.alert("تنبيه", "تأكد من البيانات");
    } catch (e) { Alert.alert("خطأ", "مشكلة اتصال"); } finally { setIsLoadingAuth(false); }
  };
  const deleteOrder = async (id) => {
      try { await fetch(`${BACKEND_URL}/delete-order/${id}`, {method:'DELETE'}); fetchOrders(); fetchMyOrders(); } catch(e){}
  };
  const updateOrderStatus = async (id, st) => {
      try { await fetch(`${BACKEND_URL}/update-order/${id}`, {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({status:st})}); fetchOrders(); } catch(e){}
  };
  const getStatusColor = (s) => s.includes('مكتمل')?'#2A9D8F':s.includes('جاري')?'#F4A261':'#E76F51';

  // --- Screens ---
  if (currentScreen === 'splash') return <View style={styles.center}><ActivityIndicator size="large" color="#2A9D8F"/></View>;

  if (currentScreen === 'admin') {
      return (
        // تغليف الشاشة بـ SafeAreaProvider ضروري لعمل المكتبة
        <SafeAreaProvider>
            <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
                <StatusBar barStyle="dark-content" backgroundColor="white" />
                
                <View style={styles.header}>
                    <Text style={styles.headerTitle}>لوحة المدير 🛠️</Text>
                    <TouchableOpacity onPress={handleLogout}>
                        <Ionicons name="log-out" size={24} color="red"/>
                    </TouchableOpacity>
                </View>

                <FlatList 
                    data={adminOrders} 
                    keyExtractor={i => i.id.toString()} 
                    contentContainerStyle={{padding: 15, paddingBottom: 50}} // إضافة مساحة في الأسفل
                    refreshControl={<RefreshControl refreshing={false} onRefresh={fetchOrders}/>}
                    renderItem={({item}) => (
                        <View style={styles.orderCard}>
                            <View style={styles.cardHeader}>
                                <Text style={styles.userName}>{item.user_name}</Text>
                                <TouchableOpacity onPress={() => deleteOrder(item.id)}>
                                    <Ionicons name="trash-outline" size={20} color="red"/>
                                </TouchableOpacity>
                            </View>
                            <Text style={styles.priceTag}>{item.amount} د.ع</Text>
                            <Text style={{textAlign: 'right', color: '#666'}}>{item.user_phone}</Text>
                            <View style={styles.summaryBox}>
                                <Text style={{textAlign: 'right'}}>{item.summary}</Text>
                            </View>
                            <Text style={{textAlign: 'right', marginTop: 5}}>
                                الحالة: <Text style={{color: getStatusColor(item.status)}}>{item.status}</Text>
                            </Text>
                            <View style={styles.actionRow}>
                                <TouchableOpacity onPress={() => updateOrderStatus(item.id, 'جاري الغسل ⏳')} style={[styles.statusBtn, {backgroundColor: '#F4A261'}]}>
                                    <Text style={{color: 'white'}}>بدء</Text>
                                </TouchableOpacity>
                                <TouchableOpacity onPress={() => updateOrderStatus(item.id, 'مكتمل ✅')} style={[styles.statusBtn, {backgroundColor: '#2A9D8F'}]}>
                                    <Text style={{color: 'white'}}>إنجاز</Text>
                                </TouchableOpacity>
                                <TouchableOpacity onPress={() => Linking.openURL(`tel:${item.user_phone}`)} style={[styles.iconBtn, {backgroundColor: '#264653'}]}>
                                    <Ionicons name="call" size={16} color="white"/>
                                </TouchableOpacity>
                            </View>
                        </View>
                    )}
                />
            </SafeAreaView>
        </SafeAreaProvider>
      );
  }

  // --- Customer Home ---
  if (currentScreen === 'home') {
    return (
        <SafeAreaProvider>
            <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
                <StatusBar barStyle="dark-content" backgroundColor="white" />
                
                <View style={{flex:1}}>
                    {/* Header */}
                    <View style={styles.header}>
                        <Text style={styles.headerTitle}>مكوى المدينة ✨</Text>
                        <TouchableOpacity onPress={handleLogout}>
                            <Ionicons name="log-out-outline" size={24} color="#d32f2f"/>
                        </TouchableOpacity>
                    </View>

                    {activeTab === 'products' ? (
                        <>
                            <FlatList
                                data={categories}
                                keyExtractor={item => item.id.toString()}
                                numColumns={2}
                                contentContainerStyle={{padding:10, paddingBottom:120}}
                                refreshControl={
                                    <RefreshControl refreshing={isFetchingProducts} onRefresh={fetchCategoriesFromServer} />
                                }
                                ListEmptyComponent={
                                    !isFetchingProducts ? (
                                        <View style={{alignItems:'center', marginTop:50}}>
                                            <Text style={{color:'#888'}}>جاري تحميل القائمة...</Text>
                                            <ActivityIndicator size="small" color="#2A9D8F" style={{marginTop:10}} />
                                        </View>
                                    ) : null
                                }
                                ListFooterComponent={
                                    <View style={{alignItems:'center', marginTop:20, marginBottom:10, opacity:0.8}}>
                                        <Text style={{color:'#aaa', fontSize:10, marginBottom:5}}>Developed by</Text>
                                        <TouchableOpacity 
                                            onPress={() => Linking.openURL(INSTAGRAM_URL)} 
                                            style={{flexDirection:'row-reverse', alignItems:'center', backgroundColor:'#fff', paddingVertical:6, paddingHorizontal:12, borderRadius:20, elevation:1}}
                                        >
                                            <Ionicons name="logo-instagram" size={18} color="#C13584" style={{marginLeft:6}} />
                                            <Text style={{fontWeight:'bold', color:'#264653', fontSize:12}}>Aymen N. Hamad</Text>
                                        </TouchableOpacity>
                                    </View>
                                }
                                renderItem={({ item }) => (
                                <TouchableOpacity style={styles.card} onPress={() => setSelectedCategory(item)}>
                                    <Ionicons name={item.icon || 'folder'} size={40} color="#2A9D8F" />
                                    <Text style={styles.cardText}>{item.name}</Text>
                                    <Text style={{fontSize:10, color:'#888', marginTop:5}}>اضغط للعرض 👈</Text>
                                </TouchableOpacity>
                                )}
                            />
                            {cart.length > 0 && (
                                <View style={styles.floatingCart}>
                                    <Text style={{color:'white', fontWeight:'bold'}}>{calculateTotal()} د.ع</Text>
                                    <TouchableOpacity style={styles.checkoutBtn} onPress={() => setShowCheckout(true)}>
                                        <Text style={{color:'white'}}>إتمام الطلب</Text>
                                    </TouchableOpacity>
                                </View>
                            )}
                        </>
                    ) : (
                        <View style={{flex:1}}>
                            {myOrders.length === 0 ? (
                                <View style={styles.center}><Text style={{color:'#888'}}>لا توجد طلبات</Text><TouchableOpacity onPress={fetchMyOrders} style={{marginTop:10}}><Text style={{color:'#2A9D8F'}}>تحديث</Text></TouchableOpacity></View>
                            ) : (
                                <FlatList data={myOrders} keyExtractor={i=>i.id.toString()} contentContainerStyle={{padding:15}} refreshControl={<RefreshControl refreshing={false} onRefresh={fetchMyOrders}/>}
                                    renderItem={({item})=>(
                                        <View style={styles.orderCard}>
                                            <View style={styles.cardHeader}>
                                                <Text style={{fontWeight:'bold'}}>#{item.id}</Text>
                                                <Text style={{color:getStatusColor(item.status), fontWeight:'bold'}}>{item.status}</Text>
                                            </View>
                                            <View style={styles.summaryBox}><Text style={{textAlign:'right'}}>{item.summary}</Text></View>
                                            <View style={{flexDirection:'row-reverse', justifyContent:'space-between', marginTop:10}}>
                                                <Text style={{fontWeight:'bold', color:'#2A9D8F'}}>{item.amount} د.ع</Text>
                                                {item.status==='جديد' && <TouchableOpacity onPress={()=>deleteOrder(item.id)}><Ionicons name="trash-outline" size={20} color="red"/></TouchableOpacity>}
                                            </View>
                                        </View>
                                    )}
                                />
                            )}
                        </View>
                    )}
                </View>
                
                {/* Bottom Bar */}
                <View style={styles.bottomBar}>
                    <TouchableOpacity onPress={() => setActiveTab('orders')} style={styles.tabItem}>
                        <Ionicons name={activeTab === 'orders' ? "receipt" : "receipt-outline"} size={24} color={activeTab === 'orders' ? "#2A9D8F" : "#888"} />
                        <Text style={[styles.tabText, {color: activeTab === 'orders' ? "#2A9D8F" : "#888"}]}>طلباتي</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setActiveTab('products')} style={styles.tabItem}>
                        <Ionicons name={activeTab === 'products' ? "shirt" : "shirt-outline"} size={24} color={activeTab === 'products' ? "#2A9D8F" : "#888"} />
                        <Text style={[styles.tabText, {color: activeTab === 'products' ? "#2A9D8F" : "#888"}]}>الأقسام</Text>
                    </TouchableOpacity>
                </View>

                {/* --- Modals (Keep them inside SafeAreaView or outside, works both ways for RN Modal) --- */}
                
                {/* Modal 1: Products */}
                <Modal visible={selectedCategory !== null} animationType="slide" transparent>
                    <View style={styles.modalOverlay}>
                        <View style={[styles.modalContent, {height:'70%'}]}>
                            <View style={styles.cardHeader}>
                                <Text style={styles.title}>{selectedCategory?.name}</Text>
                                <TouchableOpacity onPress={()=>setSelectedCategory(null)}><Ionicons name="close-circle" size={30} color="#ccc"/></TouchableOpacity>
                            </View>
                            <FlatList 
                                data={selectedCategory?.products || []}
                                keyExtractor={item => item.id.toString()}
                                renderItem={({item}) => (
                                    <TouchableOpacity style={styles.subItemRow} onPress={() => { setSelectedProduct(item); setTempQty(1); }}>
                                        <Text style={{fontSize:16, color:'#333'}}>{item.name}</Text>
                                        <Ionicons name="add-circle-outline" size={24} color="#2A9D8F"/>
                                    </TouchableOpacity>
                                )}
                            />
                        </View>
                    </View>
                </Modal>

                {/* Modal 2: Add to Cart */}
                <Modal visible={selectedProduct !== null} transparent animationType="fade">
                    <View style={styles.modalOverlay}>
                        <View style={styles.modalContent}>
                            <Text style={styles.title}>{selectedProduct?.name}</Text>
                            <View style={{flexDirection:'row-reverse', flexWrap:'wrap', marginBottom:15}}>
                            {Object.keys(SERVICE_TYPES).map(key => (
                                <TouchableOpacity key={key} onPress={() => setTempService(key)} style={[styles.chip, tempService === key && styles.chipActive]}><Text>{SERVICE_TYPES[key]}</Text></TouchableOpacity>
                            ))}
                            </View>
                            <View style={styles.qtyRow}>
                                <TouchableOpacity onPress={()=>setTempQty(q=>q+1)}><Ionicons name="add-circle" size={40} color="#2A9D8F"/></TouchableOpacity>
                                <Text style={{fontSize:22, marginHorizontal:20}}>{tempQty}</Text>
                                <TouchableOpacity onPress={()=>setTempQty(q=>Math.max(1,q-1))}><Ionicons name="remove-circle" size={40} color="#E76F51"/></TouchableOpacity>
                            </View>
                            <TouchableOpacity style={styles.mainBtn} onPress={addToCart}>
                                <Text style={styles.btnText}>إضافة ({selectedProduct?.prices[tempService] * tempQty} د.ع)</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={()=>setSelectedProduct(null)} style={{marginTop:15}}><Text style={{textAlign:'center', color:'red'}}>رجوع</Text></TouchableOpacity>
                        </View>
                    </View>
                </Modal>

                {/* Modal 3: Checkout */}
                <Modal visible={showCheckout} transparent animationType="slide">
                    <View style={styles.modalOverlay}>
                        <View style={[styles.modalContent, {maxHeight:'80%'}]}>
                            <Text style={styles.title}>مراجعة الطلب 🛒</Text>
                            
                            <ScrollView style={{maxHeight:200, marginBottom:15}}>
                                {cart.map((item) => (
                                    <View key={item.id} style={styles.cartItemRow}>
                                        <View>
                                            <Text style={{fontWeight:'bold', textAlign:'right'}}>{item.categoryName}</Text>
                                            <Text style={{color:'#666', fontSize:12, textAlign:'right'}}>{SERVICE_TYPES[item.service]} (x{item.qty})</Text>
                                            <Text style={{color:'#2A9D8F', fontWeight:'bold', textAlign:'right'}}>{item.totalPrice} د.ع</Text>
                                        </View>
                                        <TouchableOpacity onPress={() => removeFromCart(item.id)} style={{padding:5}}>
                                            <Ionicons name="trash" size={24} color="#E76F51" />
                                        </TouchableOpacity>
                                    </View>
                                ))}
                            </ScrollView>

                            <Text style={{textAlign:'right', fontWeight:'bold', marginBottom:10}}>خيارات التوصيل:</Text>
                            <View style={{flexDirection:'row-reverse', marginBottom:20}}>
                                <TouchableOpacity onPress={() => setDeliveryType('two_way')} style={[styles.chip, deliveryType === 'two_way' && styles.chipActive]}><Text>ذهاب وإياب (2000)</Text></TouchableOpacity>
                                <TouchableOpacity onPress={() => setDeliveryType('one_way')} style={[styles.chip, deliveryType === 'one_way' && styles.chipActive]}><Text>اتجاه واحد (1000)</Text></TouchableOpacity>
                            </View>

                            <View style={{borderTopWidth:1, borderColor:'#eee', paddingTop:10, marginBottom:15}}>
                                <Text style={{textAlign:'center', fontSize:18, fontWeight:'bold', color:'#2A9D8F'}}>المجموع: {calculateTotal()} د.ع</Text>
                            </View>

                            <TouchableOpacity style={styles.mainBtn} onPress={sendOrderToServer}><Text style={styles.btnText}>تأكيد وإرسال 🚀</Text></TouchableOpacity>
                            <TouchableOpacity onPress={()=>setShowCheckout(false)} style={{marginTop:15}}><Text style={{textAlign:'center'}}>إغلاق</Text></TouchableOpacity>
                        </View>
                    </View>
                </Modal>
            </SafeAreaView>
        </SafeAreaProvider>
    );
  }

  // Auth Screens
  if (currentScreen === 'login' || currentScreen === 'register') {
      const isLogin = currentScreen === 'login';
      return (
        <SafeAreaView style={styles.container}>
          <View style={styles.authBox}>
            <Text style={styles.title}>{isLogin ? 'تسجيل الدخول' : 'حساب جديد'}</Text>
            {!isLogin && <TextInput style={styles.input} placeholder="الاسم" value={regName} onChangeText={setRegName} />}
            <TextInput style={styles.input} placeholder="الهاتف" keyboardType="numeric" value={isLogin?loginPhone:regPhone} onChangeText={isLogin?setLoginPhone:setRegPhone} />
            <TextInput style={styles.input} placeholder="الرمز السري" secureTextEntry value={isLogin?loginPassword:regPassword} onChangeText={isLogin?setLoginPassword:setRegPassword} />
            <TouchableOpacity style={styles.mainBtn} onPress={() => isLogin ? handleAuth('login', {phone:loginPhone, password:loginPassword}, true) : handleAuth('register', {full_name:regName, phone:regPhone, password:regPassword}, false)}>
                <Text style={styles.btnText}>{isLoadingAuth ? '...' : (isLogin ? 'دخول' : 'تسجيل')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setCurrentScreen(isLogin ? 'register' : 'login')} style={{marginTop:20}}>
                <Text style={{color:'#2A9D8F'}}>{isLogin ? 'حساب جديد' : 'لديك حساب؟'}</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      );
  }
  return null;
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#F8F9FA' 
},
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { padding: 15, backgroundColor: 'white', flexDirection:'row-reverse', justifyContent:'space-between', alignItems: 'center', borderBottomWidth: 1, borderColor: '#eee', elevation: 2 },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#264653' },
  
  bottomBar: { 
      flexDirection: 'row', 
      backgroundColor: 'white', 
      borderTopWidth: 1, 
      borderColor: '#eee', 
      paddingVertical: 10, // مسافة داخلية بسيطة
      elevation: 5 
  },
  tabItem: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tabText: { fontSize: 12, marginTop: 4, fontWeight: 'bold' },

  card: { flex: 1, backgroundColor: 'white', margin: 8, padding: 20, borderRadius: 12, alignItems: 'center', elevation: 2, minWidth:150 },
  cardText: { marginTop: 10, fontWeight: 'bold', color:'#333', fontSize:16 },
  
  orderCard: { backgroundColor:'white', padding:15, borderRadius:12, marginBottom:10, elevation:1, borderWidth:1, borderColor:'#f0f0f0' },
  cardHeader: { flexDirection:'row-reverse', justifyContent:'space-between', marginBottom:8 },
  userName: { fontWeight:'bold', fontSize:16, color:'#264653' },
  priceTag: { color:'#2A9D8F', fontWeight:'bold', fontSize:16 },
  summaryBox: { backgroundColor:'#f8f9fa', padding:10, borderRadius:8, marginVertical:5 },
  actionRow: { flexDirection:'row-reverse', justifyContent:'space-between', marginTop:10, paddingTop:10, borderTopWidth:1, borderColor:'#eee' },
  
  statusBtn: { paddingVertical:6, paddingHorizontal:12, borderRadius:20, marginHorizontal:2 },
  iconBtn: { padding:8, borderRadius:20, width:35, height:35, justifyContent:'center', alignItems:'center' },
  mainBtn: { backgroundColor: '#2A9D8F', padding: 15, borderRadius: 10, width: '100%', alignItems: 'center', elevation:2 },
  btnText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
  input: { width: '100%', backgroundColor: 'white', padding: 15, borderRadius: 10, marginBottom: 15, borderWidth: 1, borderColor: '#ddd', textAlign: 'right' },
  authBox: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 25 },
  title: { fontSize: 22, fontWeight: 'bold', color: '#264653', marginBottom: 20 },

  floatingCart: { position: 'absolute', bottom: 90, left: 20, right: 20, backgroundColor: '#264653', padding: 15, borderRadius: 30, flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', elevation: 10 },
  checkoutBtn: { backgroundColor: '#E76F51', paddingVertical: 8, paddingHorizontal: 20, borderRadius: 20 },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: 'white', padding: 25, borderTopLeftRadius: 25, borderTopRightRadius: 25 },
  qtyRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  chip: { padding: 8, borderRadius: 20, borderWidth: 1, borderColor: '#ddd', flex:1, marginHorizontal:4, alignItems:'center' },
  chipActive: { backgroundColor: '#E0F2F1', borderColor: '#2A9D8F', borderWidth:2 },
  
  subItemRow: { flexDirection:'row-reverse', justifyContent:'space-between', padding:15, borderBottomWidth:1, borderColor:'#eee', alignItems:'center' },
  
  cartItemRow: { 
    flexDirection:'row-reverse', 
    justifyContent:'space-between', 
    alignItems:'center', 
    backgroundColor:'#f9f9f9', 
    padding:10, 
    borderRadius:8, 
    marginBottom:8 
  }
});